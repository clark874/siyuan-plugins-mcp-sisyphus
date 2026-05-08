import * as blockApi from '../../api/block';
import * as documentApi from '../../api/document';
import * as fileApi from '../../api/file';
import * as notebookApi from '../../api/notebook';
import type { FsAction } from '../../core/config';
import { normalizeMarkdownContent } from '../../core/normalize';
import {
    FsLsSchema,
    FsMvSchema,
    FsReplaceSchema,
    FsReadSchema,
    FsRmSchema,
    FsSearchSchema,
    FsTreeSchema,
    FsWriteSchema,
} from '../../core/types';
import { ensurePermissionForNotebook, listChildDocumentsByPath } from '../internal/context';
import type { ToolActionHandler } from '../internal/define-tool';
import {
    resolveFsCreateTarget,
    resolveFsDestinationTarget,
    resolveFsScopePath,
    type FsDocumentPath,
    type FsScopePath,
} from '../internal/helpers/fs-path';
import { applyExactReplaceEdits } from '../internal/replace';
import { createJsonResult, createPaginatedResult } from '../internal/shared';
import { applyUiRefresh } from '../internal/ui-refresh';

type FsActionHandler = ToolActionHandler;

interface FsListItem {
    name: string;
    path: string;
    children: number;
}

interface ExportedMarkdownPayload {
    content: string;
    hPath?: string;
}

function stripSySuffix(name: string | undefined): string | undefined {
    return typeof name === 'string' ? name.replace(/\.sy$/, '') : undefined;
}

function lastSegment(path: string | undefined): string | undefined {
    if (!path) return undefined;
    return path.split('/').filter(Boolean).at(-1);
}

function joinHumanPath(parent: string, name: string): string {
    const base = parent === '/' ? '' : parent.replace(/\/+$/, '');
    return `${base}/${name.replace(/^\/+/, '')}`;
}

function canonicalNotebookPath(notebookName: string, hPath: string): string {
    return hPath === '/'
        ? `/${notebookName}`
        : `/${notebookName}${hPath}`;
}

function compactChild(parentPath: string, child: { name?: string; path: string; subFileCount?: number; count?: number }): FsListItem {
    const name = stripSySuffix(child.name) ?? stripSySuffix(lastSegment(child.path)) ?? child.path;
    return {
        name,
        path: joinHumanPath(parentPath, name),
        children: child.subFileCount ?? child.count ?? 0,
    };
}

async function listReadableNotebooks(client: Parameters<FsActionHandler>[0]['client'], permMgr: Parameters<FsActionHandler>[0]['permMgr']) {
    await permMgr.reload();
    const result = await notebookApi.listNotebooks(client);
    return result.notebooks.filter((notebook) => permMgr.canRead(notebook.id));
}

async function listScopeChildren(client: Parameters<FsActionHandler>[0]['client'], scope: FsScopePath): Promise<FsListItem[]> {
    if (scope.type === 'root') return [];
    const children = await listChildDocumentsByPath(client, scope.notebook, scope.storagePath);
    return children.map((child) => compactChild(scope.canonicalPath, child));
}

function deriveTreeNodeFallback(node: Record<string, unknown>, parentPath: string): { name: string; path: string } {
    const name = stripSySuffix(typeof node.name === 'string' ? node.name : undefined)
        ?? stripSySuffix(lastSegment(typeof node.hPath === 'string' ? node.hPath : undefined))
        ?? stripSySuffix(lastSegment(typeof node.path === 'string' ? node.path : undefined))
        ?? (typeof node.id === 'string' ? node.id : 'Untitled');
    return {
        name,
        path: joinHumanPath(parentPath, name),
    };
}

async function normalizeTreeNodes(
    client: Parameters<FsActionHandler>[0]['client'],
    nodes: unknown,
    parentPath: string,
    notebookName: string,
    maxDepth: number,
    depth = 0,
    hPathCache = new Map<string, Promise<string>>(),
): Promise<unknown[]> {
    if (!Array.isArray(nodes)) return [];
    return Promise.all(nodes.map(async (node) => {
        const typed = node && typeof node === 'object' ? node as Record<string, unknown> : {};
        const fallback = deriveTreeNodeFallback(typed, parentPath);
        let name = fallback.name;
        let path = fallback.path;
        const id = typeof typed.id === 'string' ? typed.id : undefined;
        if (id) {
            try {
                let pending = hPathCache.get(id);
                if (!pending) {
                    pending = documentApi.getHPathByID(client, id);
                    hPathCache.set(id, pending);
                }
                const hPath = await pending;
                const resolvedName = stripSySuffix(lastSegment(hPath));
                if (resolvedName) {
                    name = resolvedName;
                    path = canonicalNotebookPath(notebookName, hPath);
                }
            } catch {
                // Keep the fallback name/path when hPath lookup fails.
            }
        }
        const rawChildren = Array.isArray(typed.children) ? typed.children : [];
        const compact: Record<string, unknown> = {
            name,
            path,
        };
        if (depth >= maxDepth) {
            compact.children = rawChildren.length;
        } else {
            compact.children = await normalizeTreeNodes(
                client,
                rawChildren,
                compact.path as string,
                notebookName,
                maxDepth,
                depth + 1,
                hPathCache,
            );
        }
        return compact;
    }));
}

function extractTreeArray(result: unknown): unknown[] {
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).tree)) {
        return (result as Record<string, unknown>).tree as unknown[];
    }
    return [];
}

function collectTreeIds(nodes: unknown): string[] {
    if (!Array.isArray(nodes)) return [];
    const ids: string[] = [];
    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const typed = node as Record<string, unknown>;
        if (typeof typed.id === 'string') ids.push(typed.id);
        if (Array.isArray(typed.children)) ids.push(...collectTreeIds(typed.children));
    }
    return ids;
}

function paginateContent(content: string, page = 1, pageSize = 8000) {
    const pageCount = Math.max(1, Math.ceil(content.length / pageSize));
    const normalizedPage = Math.min(page, pageCount);
    const start = (normalizedPage - 1) * pageSize;
    const slice = content.slice(start, start + pageSize);
    return {
        content: slice,
        truncated: content.length > pageSize,
        contentLength: content.length,
        showing: slice.length,
        page: normalizedPage,
        pageSize,
        pageCount,
        hasNextPage: normalizedPage < pageCount,
    };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveDocumentTitle(hPath: string | undefined): string | undefined {
    const segment = stripSySuffix(lastSegment(hPath));
    return typeof segment === 'string' && segment.length > 0 ? segment : undefined;
}

function stripExportedDocumentWrapper(payload: ExportedMarkdownPayload): string {
    let content = payload.content;
    const title = deriveDocumentTitle(payload.hPath);

    if (content.startsWith('---\n')) {
        const frontMatterMatch = content.match(/^---\n[\s\S]*?\n---\n*/);
        if (frontMatterMatch) {
            content = content.slice(frontMatterMatch[0].length);
        }
    }

    if (title) {
        const headingPattern = new RegExp(`^# ${escapeRegExp(title)}\\s*\\n+`);
        content = content.replace(headingPattern, '');
    }

    return content;
}

async function overwriteDocumentBody(
    client: Parameters<FsActionHandler>[0]['client'],
    documentId: string,
    markdown: string,
) {
    const blocks = await blockApi.getChildBlocks(client, documentId);
    for (const block of blocks) {
        if (typeof block.id === 'string') {
            await blockApi.deleteBlock(client, block.id);
        }
    }
    if (markdown.trim().length > 0) {
        await blockApi.appendBlock(client, 'markdown', markdown, documentId);
    }
}

async function collectSearchDocuments(
    client: Parameters<FsActionHandler>[0]['client'],
    permMgr: Parameters<FsActionHandler>[0]['permMgr'],
    scope: FsScopePath,
): Promise<Array<{ id: string; notebookName: string }>> {
    if (scope.type === 'document') {
        const tree = extractTreeArray(await documentApi.listDocTree(client, scope.notebook, scope.storagePath));
        return [...new Set([scope.id, ...collectTreeIds(tree)])].map((id) => ({ id, notebookName: scope.notebookName }));
    }
    if (scope.type === 'notebook') {
        const tree = extractTreeArray(await documentApi.listDocTree(client, scope.notebook, '/'));
        return [...new Set(collectTreeIds(tree))].map((id) => ({ id, notebookName: scope.notebookName }));
    }
    const notebooks = await listReadableNotebooks(client, permMgr);
    const docs: Array<{ id: string; notebookName: string }> = [];
    for (const notebook of notebooks) {
        const tree = extractTreeArray(await documentApi.listDocTree(client, notebook.id, '/'));
        docs.push(...[...new Set(collectTreeIds(tree))].map((id) => ({ id, notebookName: notebook.name })));
    }
    return docs;
}

function createMatcher(query: string, regex?: boolean, caseSensitive?: boolean): (line: string) => boolean {
    if (regex) {
        const flags = caseSensitive ? '' : 'i';
        const pattern = new RegExp(query, flags);
        return (line) => pattern.test(line);
    }
    const needle = caseSensitive ? query : query.toLowerCase();
    return (line) => (caseSensitive ? line : line.toLowerCase()).includes(needle);
}

const handleLs: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsLsSchema.parse(rawArgs);
    const scope = await resolveFsScopePath(client, permMgr, parsed.path, 'read');
    if (scope.type === 'root') {
        const notebooks = await listReadableNotebooks(client, permMgr);
        const items: FsListItem[] = [];
        for (const notebook of notebooks) {
            let children = 0;
            try {
                children = (await listChildDocumentsByPath(client, notebook.id, '/')).length;
            } catch {
                children = 0;
            }
            items.push({ name: notebook.name, path: `/${notebook.name}`, children });
        }
        return createJsonResult({ path: '/', items });
    }
    const denied = await ensurePermissionForNotebook(permMgr, scope.notebook, 'read');
    if (denied) return denied;
    return createJsonResult({ path: scope.canonicalPath, items: await listScopeChildren(client, scope) });
};

const handleTree: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsTreeSchema.parse(rawArgs);
    const scope = await resolveFsScopePath(client, permMgr, parsed.path, 'read');
    const maxDepth = parsed.maxDepth ?? 3;
    if (scope.type === 'root') {
        const notebooks = await listReadableNotebooks(client, permMgr);
        const tree = [];
        for (const notebook of notebooks) {
            const result = await documentApi.listDocTree(client, notebook.id, '/');
            tree.push({
                name: notebook.name,
                path: `/${notebook.name}`,
                children: await normalizeTreeNodes(client, extractTreeArray(result), `/${notebook.name}`, notebook.name, maxDepth),
            });
        }
        return createJsonResult({ path: '/', tree, maxDepth });
    }
    const denied = await ensurePermissionForNotebook(permMgr, scope.notebook, 'read');
    if (denied) return denied;
    const result = await documentApi.listDocTree(client, scope.notebook, scope.storagePath);
    return createJsonResult({
        path: scope.canonicalPath,
        tree: await normalizeTreeNodes(client, extractTreeArray(result), scope.canonicalPath, scope.notebookName, maxDepth),
        maxDepth,
    });
};

const handleRead: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsReadSchema.parse(rawArgs);
    const scope = await resolveFsScopePath(client, permMgr, parsed.path, 'read');
    if (scope.type !== 'document') throw new Error(`fs.read requires a document path, got "${parsed.path}".`);
    const denied = await ensurePermissionForNotebook(permMgr, scope.notebook, 'read');
    if (denied) return denied;
    const markdown = normalizeMarkdownContent(await fileApi.exportMdContent(client, scope.id));
    const content = typeof markdown.content === 'string' ? markdown.content : '';
    const paged = paginateContent(content, parsed.page, parsed.pageSize);
    return createJsonResult({
        path: scope.canonicalPath,
        content: paged.content,
        ...(paged.truncated ? {
            truncated: true,
            contentLength: paged.contentLength,
            showing: paged.showing,
            page: paged.page,
            pageSize: paged.pageSize,
            pageCount: paged.pageCount,
            hasNextPage: paged.hasNextPage,
        } : {}),
    });
};

const handleWrite: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsWriteSchema.parse(rawArgs);
    const target = await resolveFsCreateTarget(client, permMgr, parsed.path);
    const denied = await ensurePermissionForNotebook(permMgr, target.notebook, 'write');
    if (denied) return denied;

    let existing: FsDocumentPath | null = null;
    try {
        const resolved = await resolveFsScopePath(client, permMgr, target.canonicalPath, 'write');
        existing = resolved.type === 'document' ? resolved : null;
    } catch {
        existing = null;
    }

    if (!existing) {
        const id = await documentApi.createDoc(client, target.notebook, target.hPath, parsed.markdown);
        return applyUiRefresh(client, createJsonResult({ success: true, path: target.canonicalPath, created: true }), [
            { type: 'reloadProtyle', id },
            { type: 'reloadFiletree' },
        ]);
    }

    if (!parsed.overwrite) {
        throw new Error(`Document already exists at "${existing.canonicalPath}". Pass overwrite=true to replace its body.`);
    }

    await overwriteDocumentBody(client, existing.id, parsed.markdown);
    return applyUiRefresh(client, createJsonResult({ success: true, path: existing.canonicalPath, overwritten: true }), [
        { type: 'reloadProtyle', id: existing.id },
        { type: 'reloadFiletree' },
    ]);
};

const handleReplace: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsReplaceSchema.parse(rawArgs);
    const scope = await resolveFsScopePath(client, permMgr, parsed.path, 'write');
    if (scope.type !== 'document') throw new Error(`fs.replace requires a document path, got "${parsed.path}".`);
    const denied = await ensurePermissionForNotebook(permMgr, scope.notebook, 'write');
    if (denied) return denied;

    const markdown = normalizeMarkdownContent(await fileApi.exportMdContent(client, scope.id));
    const originalContent = stripExportedDocumentWrapper({
        content: typeof markdown.content === 'string' ? markdown.content : '',
        hPath: typeof markdown.hPath === 'string' ? markdown.hPath : undefined,
    });
    const edits = Array.isArray(parsed.edit) ? parsed.edit : [parsed.edit];
    const { content: nextContent, summary } = applyExactReplaceEdits(originalContent, edits, 'fs.replace');

    const changed = nextContent !== originalContent;
    if (changed) {
        await overwriteDocumentBody(client, scope.id, nextContent);
    }

    return applyUiRefresh(client, createJsonResult({
        success: true,
        path: scope.canonicalPath,
        changed,
        editsApplied: summary.length,
        replacements: summary,
    }), changed ? [
        { type: 'reloadProtyle', id: scope.id },
        { type: 'reloadFiletree' },
    ] : []);
};

const handleRm: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsRmSchema.parse(rawArgs);
    const scope = await resolveFsScopePath(client, permMgr, parsed.path, 'delete');
    if (scope.type !== 'document') throw new Error(`fs.rm requires a document path, got "${parsed.path}".`);
    const denied = await ensurePermissionForNotebook(permMgr, scope.notebook, 'delete');
    if (denied) return denied;
    await documentApi.removeDocByID(client, scope.id);
    return applyUiRefresh(client, createJsonResult({ success: true, path: scope.canonicalPath }), [
        { type: 'reloadProtyle', id: scope.id },
        { type: 'reloadFiletree' },
    ]);
};

const handleMv: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsMvSchema.parse(rawArgs);
    const source = await resolveFsScopePath(client, permMgr, parsed.from, 'write');
    if (source.type !== 'document') throw new Error(`fs.mv source must be a document path, got "${parsed.from}".`);
    const destination = await resolveFsDestinationTarget(client, permMgr, parsed.to);
    const sourceDenied = await ensurePermissionForNotebook(permMgr, source.notebook, 'write');
    if (sourceDenied) return sourceDenied;
    const destinationDenied = await ensurePermissionForNotebook(permMgr, destination.notebook, 'write');
    if (destinationDenied) return destinationDenied;
    try {
        const existingDestination = await resolveFsScopePath(client, permMgr, destination.canonicalPath, 'write');
        if (existingDestination.type === 'document' && existingDestination.id !== source.id) {
            throw new Error(`Destination already exists at "${destination.canonicalPath}".`);
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('Destination already exists')) {
            throw error;
        }
    }

    await documentApi.moveDocsByID(client, [source.id], destination.parentId ?? destination.notebook);
    if (source.name !== destination.title) {
        await documentApi.renameDocByID(client, source.id, destination.title);
    }
    return applyUiRefresh(client, createJsonResult({
        success: true,
        path: source.canonicalPath,
        movedTo: destination.canonicalPath,
    }), [
        { type: 'reloadProtyle', id: source.id },
        { type: 'reloadFiletree' },
    ]);
};

const handleSearch: FsActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FsSearchSchema.parse(rawArgs);
    const scope = await resolveFsScopePath(client, permMgr, parsed.path, 'read');
    if (scope.type !== 'root') {
        const denied = await ensurePermissionForNotebook(permMgr, scope.notebook, 'read');
        if (denied) return denied;
    }

    const docs = await collectSearchDocuments(client, permMgr, scope);
    const matches: Array<{ path: string; line: number; text: string }> = [];
    const matcher = createMatcher(parsed.query, parsed.regex, parsed.caseSensitive);
    for (const doc of docs) {
        const markdown = normalizeMarkdownContent(await fileApi.exportMdContent(client, doc.id));
        const content = typeof markdown.content === 'string' ? markdown.content : '';
        const hPath = typeof markdown.hPath === 'string' ? markdown.hPath : `/${doc.id}`;
        const path = `/${doc.notebookName}${hPath}`;
        content.split(/\r?\n/).forEach((line, index) => {
            if (matcher(line)) {
                matches.push({
                    path,
                    line: index + 1,
                    text: line.length > 300 ? `${line.slice(0, 297)}...` : line,
                });
            }
        });
    }
    const seenMatches = new Set<string>();
    const uniqueMatches = matches.filter((match) => {
        const key = `${match.path}\0${match.line}\0${match.text}`;
        if (seenMatches.has(key)) return false;
        seenMatches.add(key);
        return true;
    });

    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 50;
    const pageCount = Math.max(1, Math.ceil(uniqueMatches.length / pageSize));
    const normalizedPage = Math.min(page, pageCount);
    const start = (normalizedPage - 1) * pageSize;
    return createPaginatedResult(uniqueMatches.slice(start, start + pageSize), {
        total: uniqueMatches.length,
        page: normalizedPage,
        pageSize,
        pageCount,
        hasNextPage: normalizedPage < pageCount,
    }, {
        path: scope.canonicalPath,
        query: parsed.query,
        regex: parsed.regex ?? false,
        caseSensitive: parsed.caseSensitive ?? false,
    });
};

export const FS_ACTION_HANDLERS: Record<FsAction, FsActionHandler> = {
    ls: handleLs,
    tree: handleTree,
    read: handleRead,
    write: handleWrite,
    replace: handleReplace,
    rm: handleRm,
    mv: handleMv,
    search: handleSearch,
};
