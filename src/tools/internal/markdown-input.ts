import * as blockApi from '../../api/block';
import type { SiYuanClient } from '../../api/client';
import type { PermissionManager } from '../../core/permissions';
import { ensurePermissionForDocumentId } from './context';
import { lintMarkdown } from '../../../agent-kit/scripts/markdown-lint.mjs';
import { assertSafeBlockReferenceMarkdown, extractKramdownContentForEditing, normalizeBlockRefQuoteStyle } from './kramdown-safe';
import { createSemanticError } from './validation';

const NAKED_BLOCK_REF_PATTERN = /\(\(([0-9]{14}-[a-z0-9]{7})\)\)/g;

function escapeBlockRefAnchor(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function stripInlineMarkdown(value: string): string {
    return value
        .replace(/\{:\s*[^}]*\}/g, '')
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\(\(([0-9]{14}-[a-z0-9]{7})\s+'([^']+)'\)\)/g, '$2')
        .replace(/[*_~`=]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function firstReadableLine(markdown: string): string {
    return markdown
        .split(/\r?\n/)
        .map((line) => stripInlineMarkdown(line))
        .find((line) => line.length > 0) ?? '';
}

async function resolveBlockRefAnchor(client: SiYuanClient, permMgr: PermissionManager, id: string): Promise<string> {
    try {
        const { context, denied } = await ensurePermissionForDocumentId(client, permMgr, id, 'read');
        if (denied || !context.notebook) return id;
    } catch {
        return id;
    }
    try {
        const result = await blockApi.getBlockKramdown(client, id);
        const content = typeof result.kramdown === 'string'
            ? firstReadableLine(extractKramdownContentForEditing(result.kramdown))
            : '';
        if (content) return content;
    } catch {
        // Fall back to getBlockInfo below.
    }

    try {
        const info = await blockApi.getBlockInfo(client, id);
        if (info && typeof info === 'object') {
            const record = info as Record<string, unknown>;
            for (const key of ['content', 'fcontent', 'name', 'markdown']) {
                const value = record[key];
                if (typeof value === 'string') {
                    const content = firstReadableLine(value);
                    if (content) return content;
                }
            }
        }
    } catch {
        // Report a single clear error below.
    }

    return id;
}

export async function normalizeMarkdownInputRefs(
    client: SiYuanClient,
    permMgr: PermissionManager,
    markdown: string,
    actionName: string,
    options: { matchingExisting?: boolean } = {},
): Promise<string> {
    if (!options.matchingExisting) assertMarkdownInput(markdown, actionName);
    const quoteNormalizedMarkdown = normalizeBlockRefQuoteStyle(markdown);
    assertSafeBlockReferenceMarkdown(quoteNormalizedMarkdown, actionName, { allowNakedBlockRefs: true });

    const ids = [...new Set([...quoteNormalizedMarkdown.matchAll(NAKED_BLOCK_REF_PATTERN)].map((match) => match[1]))];
    if (ids.length === 0) return quoteNormalizedMarkdown;

    const anchors = new Map<string, string>();
    await Promise.all(ids.map(async (id) => {
        anchors.set(id, await resolveBlockRefAnchor(client, permMgr, id));
    }));

    const normalized = quoteNormalizedMarkdown.replace(NAKED_BLOCK_REF_PATTERN, (_raw, id: string) => {
        const anchor = anchors.get(id);
        return `((${id} '${escapeBlockRefAnchor(anchor ?? id)}'))`;
    });
    assertSafeBlockReferenceMarkdown(normalized, actionName);
    return normalized;
}

/** 严格写入预检与常规写入使用同一份原始 Markdown 诊断。 */
export function assertMarkdownInput(markdown: string, actionName: string) {
    const diagnostics = lintMarkdown(markdown);
    const error = diagnostics.find(diagnostic => diagnostic.severity === 'error');
    if (error) {
        const location = `原始 Markdown 第 ${error.line} 行第 ${error.column} 列`;
        const counts = 'expectedColumns' in error ? `预期 ${error.expectedColumns} 列，实际 ${error.actualColumns} 列。` : '';
        throw Object.assign(createSemanticError('invalid_arguments',
            `${actionName} ${error.hint}（${location}）。${counts}`, error.rule), { diagnostics });
    }
    return diagnostics;
}

export async function normalizeReplaceEditsRefs<T extends { old: string; new: string }>(
    client: SiYuanClient,
    permMgr: PermissionManager,
    edits: T[],
    actionName: string,
): Promise<T[]> {
    return Promise.all(edits.map(async (edit) => ({
        ...edit,
        old: await normalizeMarkdownInputRefs(client, permMgr, edit.old, actionName, { matchingExisting: true }),
        new: await normalizeMarkdownInputRefs(client, permMgr, edit.new, actionName),
    })));
}
