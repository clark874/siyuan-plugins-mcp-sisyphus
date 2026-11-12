import * as blockApi from '../../api/block';
import type { SiYuanClient } from '../../api/client';
import { findUnsupportedTable, readMarkdownTables } from '../../../agent-kit/scripts/pandoc-grid-table.mjs';
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

async function resolveBlockRefAnchor(client: SiYuanClient, id: string): Promise<string> {
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
    markdown: string,
    actionName: string,
    options: { matchingExisting?: boolean } = {},
): Promise<string> {
    if (!options.matchingExisting) {
        const incompatible = findUnsupportedTable(markdown);
        if (incompatible) {
            throw createSemanticError('invalid_arguments',
                `警告：${actionName} 检测到 ${incompatible.kind}（待写入正文第 ${incompatible.line} 行），已停止录入。请转换为规范 Markdown 管道表。`,
                incompatible.kind === 'Pandoc 网格表格' ? 'pandoc_grid_table' : 'html_table_unsupported');
        }
        readMarkdownTables(markdown);
    }
    const quoteNormalizedMarkdown = normalizeBlockRefQuoteStyle(markdown);
    assertSafeBlockReferenceMarkdown(quoteNormalizedMarkdown, actionName, { allowNakedBlockRefs: true });

    const ids = [...new Set([...quoteNormalizedMarkdown.matchAll(NAKED_BLOCK_REF_PATTERN)].map((match) => match[1]))];
    if (ids.length === 0) return quoteNormalizedMarkdown;

    const anchors = new Map<string, string>();
    await Promise.all(ids.map(async (id) => {
        anchors.set(id, await resolveBlockRefAnchor(client, id));
    }));

    const normalized = quoteNormalizedMarkdown.replace(NAKED_BLOCK_REF_PATTERN, (_raw, id: string) => {
        const anchor = anchors.get(id);
        return `((${id} '${escapeBlockRefAnchor(anchor ?? id)}'))`;
    });
    assertSafeBlockReferenceMarkdown(normalized, actionName);
    return normalized;
}

export async function normalizeReplaceEditsRefs<T extends { old: string; new: string }>(
    client: SiYuanClient,
    edits: T[],
    actionName: string,
): Promise<T[]> {
    return Promise.all(edits.map(async (edit) => ({
        ...edit,
        old: await normalizeMarkdownInputRefs(client, edit.old, actionName, { matchingExisting: true }),
        new: await normalizeMarkdownInputRefs(client, edit.new, actionName),
    })));
}
