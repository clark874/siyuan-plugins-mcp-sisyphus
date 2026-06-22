import * as blockApi from '../../api/block';
import type { SiYuanClient } from '../../api/client';
import { joinEditableMarkdownBlocks } from './kramdown-safe';

export interface OrderedDocumentBlock {
    id: string;
    type?: string;
    subtype?: string;
}

const SELF_CONTAINED_BLOCK_TYPES = new Set([
    'l',
    'b',
    'callout',
    's',
    't',
    'table',
    'tb',
    'av',
    'code',
    'c',
    'math',
    'm',
    'html',
    'iframe',
    'widget',
    'query_embed',
]);

function normalizeBlockType(type: string | undefined): string | undefined {
    if (!type) return undefined;
    const normalized = type.trim();
    if (!normalized) return undefined;
    const lower = normalized.toLowerCase();
    if (!lower.startsWith('node')) return normalized;
    if (lower.includes('paragraph')) return 'p';
    if (lower.includes('heading')) return 'h';
    if (lower.includes('listitem')) return 'i';
    if (lower.includes('list')) return 'l';
    if (lower.includes('blockquote')) return 'b';
    if (lower.includes('callout')) return 'callout';
    if (lower.includes('superblock')) return 's';
    if (lower.includes('table')) return 't';
    if (lower.includes('codeblock')) return 'c';
    if (lower.includes('mathblock')) return 'm';
    if (lower.includes('attributeview')) return 'av';
    if (lower.includes('htmlblock')) return 'html';
    if (lower.includes('iframe')) return 'iframe';
    if (lower.includes('widget')) return 'widget';
    if (lower.includes('video')) return 'video';
    if (lower.includes('audio')) return 'audio';
    if (lower.includes('blockqueryembed')) return 'query_embed';
    if (lower.includes('thematicbreak')) return 'tb';
    return normalized;
}

function toOrderedBlock(value: unknown): OrderedDocumentBlock | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    if (!id) return null;
    return {
        id,
        type: normalizeBlockType(typeof record.type === 'string' ? record.type : undefined),
        subtype: typeof record.subtype === 'string' ? record.subtype : undefined,
    };
}

function blockContainsChildrenInOwnKramdown(block: OrderedDocumentBlock): boolean {
    return Boolean(block.type && SELF_CONTAINED_BLOCK_TYPES.has(block.type));
}

async function collectDocumentBlocksInTreeOrder(
    client: SiYuanClient,
    parentId: string,
    output: OrderedDocumentBlock[],
    visited: Set<string>,
): Promise<void> {
    const children = await blockApi.getChildBlocks(client, parentId);
    for (const child of children) {
        const block = toOrderedBlock(child);
        if (!block) continue;
        if (visited.has(block.id)) continue;
        visited.add(block.id);
        output.push(block);
        if (!blockContainsChildrenInOwnKramdown(block)) {
            await collectDocumentBlocksInTreeOrder(client, block.id, output, visited);
        }
    }
}

export async function listDocumentBlocksInTreeOrder(client: SiYuanClient, documentId: string): Promise<OrderedDocumentBlock[]> {
    const blocks: OrderedDocumentBlock[] = [];
    await collectDocumentBlocksInTreeOrder(client, documentId, blocks, new Set([documentId]));
    return blocks;
}

export async function readDocumentEditableMarkdown(
    client: SiYuanClient,
    documentId: string,
    knownBlocks?: OrderedDocumentBlock[],
): Promise<string> {
    const blocks = knownBlocks ?? await listDocumentBlocksInTreeOrder(client, documentId);
    if (blocks.length === 0) return '';

    const kramdownBlocks = await Promise.all(blocks.map(async (block) => {
        const result = await blockApi.getBlockKramdown(client, block.id);
        return {
            kramdown: typeof result.kramdown === 'string' ? result.kramdown : '',
            type: block.type,
        };
    }));

    return joinEditableMarkdownBlocks(kramdownBlocks);
}

export async function readDocumentKramdownMarkdown(
    client: SiYuanClient,
    documentId: string,
    knownBlocks?: OrderedDocumentBlock[],
): Promise<string> {
    return readDocumentEditableMarkdown(client, documentId, knownBlocks);
}
