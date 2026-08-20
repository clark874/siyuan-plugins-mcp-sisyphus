import type { SiYuanClient } from '../../../api/client';
import * as documentApi from '../../../api/document';
import PromiseLimitPool from '../../../shared/promise-pool';
import { listChildDocumentsByPath, type ChildDocumentSummary } from '../context';

export const NOTEBOOK_ROOT_TREE_MAX_CONCURRENCY = 8;

export interface NotebookRootTreeError {
    type: 'subtree_read_failed';
    documentId: string;
    name?: string;
    storagePath?: string;
    message: string;
}

export interface NotebookRootTreeResult {
    nodes: unknown[];
    partial: boolean;
    errors: NotebookRootTreeError[];
    topLevelDocumentCount: number;
    failedTopLevelDocumentCount: number;
}

interface NotebookRootTreeExpansion {
    node: { id: string; children: unknown[] };
    error?: NotebookRootTreeError;
}

/** Storage-path spellings that address a notebook root rather than a document. */
export function isNotebookRootPath(path: string | undefined): boolean {
    const trimmed = (path ?? '').trim();
    return trimmed === '' || trimmed === '/';
}

/** Kernel tree payloads arrive either bare or wrapped in a `tree` field. */
export function extractTreeArray(result: unknown): unknown[] {
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).tree)) {
        return (result as Record<string, unknown>).tree as unknown[];
    }
    return [];
}

/**
 * 读取某篇文档的后代树，同时把没有子文档的普通叶子识别为空树。
 *
 * 思源的 `listDocTree` 会把文档存储路径去掉 `.sy` 后当作子目录打开；
 * 叶子文档没有该目录，因此内核会返回文件不存在。这里先通过稳定的
 * `listDocsByPath` 查询确认是否存在直接子文档，避免把正常叶子误报为
 * API 故障。若预检后子文档恰好被并发删除，则失败后再次查询；只有
 * 仍存在子文档时才保留原始错误。
 */
export async function listDocumentSubtreeNodes(
    client: SiYuanClient,
    notebook: string,
    path: string,
    knownDirectChildCount?: number,
): Promise<unknown[]> {
    if (knownDirectChildCount === 0) return [];

    if (knownDirectChildCount === undefined) {
        const children = await listChildDocumentsByPath(client, notebook, path);
        if (children.length === 0) return [];
    }

    try {
        return extractTreeArray(await documentApi.listDocTree(client, notebook, path));
    } catch (error) {
        const children = await listChildDocumentsByPath(client, notebook, path);
        if (children.length === 0) return [];
        throw error;
    }
}

/**
 * Tree nodes for a notebook root.
 *
 * `listDocTree` rejects the notebook root with "path escapes notebook
 * directory", so the root level is read with `listDocsByPath` and each
 * top-level document is expanded with its own `listDocTree` call. That is
 * `1 + K` kernel calls for `K` top-level documents, instead of one call per
 * directory in the notebook.
 *
 * Nodes carry the same `id` + `children` shape the kernel returns, so callers
 * can resolve display names exactly as they do for document subtrees. Reads
 * use a bounded pool and preserve failed top-level nodes alongside explicit
 * diagnostics, so an unavailable subtree cannot be mistaken for a real leaf.
 */
export async function listNotebookRootTreeNodes(client: SiYuanClient, notebook: string): Promise<NotebookRootTreeResult> {
    const children = await listChildDocumentsByPath(client, notebook, '/');
    const pool = new PromiseLimitPool<NotebookRootTreeExpansion>(NOTEBOOK_ROOT_TREE_MAX_CONCURRENCY);

    for (const child of children) {
        pool.add(async () => expandNotebookRootChild(client, notebook, child));
    }

    const expansions = await pool.awaitAll();
    const errors = expansions.flatMap((expansion) => expansion.error ? [expansion.error] : []);
    return {
        nodes: expansions.map((expansion) => expansion.node),
        partial: errors.length > 0,
        errors,
        topLevelDocumentCount: children.length,
        failedTopLevelDocumentCount: errors.length,
    };
}

async function expandNotebookRootChild(
    client: SiYuanClient,
    notebook: string,
    child: ChildDocumentSummary,
): Promise<NotebookRootTreeExpansion> {
    const node = { id: child.id, children: [] as unknown[] };
    if (!child.path) {
        return {
            node,
            error: createNotebookRootTreeError(child, 'Top-level document has no storage path.'),
        };
    }

    try {
        return {
            node: {
                id: child.id,
                children: await listDocumentSubtreeNodes(client, notebook, child.path, child.subFileCount),
            },
        };
    } catch (error) {
        return {
            node,
            error: createNotebookRootTreeError(child, error instanceof Error ? error.message : String(error)),
        };
    }
}

function createNotebookRootTreeError(child: ChildDocumentSummary, message: string): NotebookRootTreeError {
    return {
        type: 'subtree_read_failed',
        documentId: child.id,
        ...(child.name ? { name: child.name } : {}),
        ...(child.path ? { storagePath: child.path } : {}),
        message,
    };
}
