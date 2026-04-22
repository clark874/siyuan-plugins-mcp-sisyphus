import type { SiYuanClient } from '../../api/client';
import * as searchApi from '../../api/search';
import { escapeSqlString } from '../context';

function escapeSqlLike(value: string): string {
    return value
        .replace(/\0/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/'/g, "''");
}

function hasBacklinkPayload(result: unknown): result is { backlinks?: unknown[]; backmentions?: unknown[] } {
    return !!result && typeof result === 'object';
}

export function assertReadOnlySql(stmt: string): void {
    const trimmed = stmt.trim();
    const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
    if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
        throw new Error('Only SELECT and WITH (CTE) statements are allowed. Mutation queries (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE) are forbidden.');
    }
}

async function getBlockLabel(client: SiYuanClient, id: string): Promise<string | undefined> {
    const rows = await searchApi.querySQL(
        client,
        `SELECT content, name FROM blocks WHERE id = '${escapeSqlString(id)}' LIMIT 1`,
    );
    const row = Array.isArray(rows) && rows[0] && typeof rows[0] === 'object'
        ? rows[0] as Record<string, unknown>
        : null;
    if (!row) return undefined;

    const label = [row.content, row.name].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return label?.trim();
}

async function queryFallbackBacklinkRows(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<unknown[]> {
    const escapedId = escapeSqlString(id);
    const filters = [
        "s.type = 'textmark block-ref'",
        `instr(s.markdown, '${escapedId}') > 0`,
    ];
    if (refTreeID) {
        filters.push(`s.root_id = '${escapeSqlString(refTreeID)}'`);
    }
    if (keyword && keyword.trim()) {
        filters.push(`b.content LIKE '%${escapeSqlLike(keyword.trim())}%' ESCAPE '\\'`);
    }

    return searchApi.querySQL(
        client,
        `
        SELECT
            s.block_id AS id,
            s.root_id,
            s.box,
            s.path,
            b.hpath,
            b.type,
            b.content,
            b.markdown
        FROM spans s
        LEFT JOIN blocks b ON b.id = s.block_id
        WHERE ${filters.join(' AND ')}
        ORDER BY b.updated DESC
        LIMIT 200
        `.trim(),
    );
}

async function queryFallbackBackmentionRows(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<unknown[]> {
    const label = await getBlockLabel(client, id);
    if (!label) return [];

    const filters = [
        `id != '${escapeSqlString(id)}'`,
        `instr(content, '${escapeSqlString(label)}') > 0`,
    ];
    if (refTreeID) {
        filters.push(`root_id = '${escapeSqlString(refTreeID)}'`);
    }
    if (keyword && keyword.trim()) {
        filters.push(`instr(content, '${escapeSqlString(keyword.trim())}') > 0`);
    }

    return searchApi.querySQL(
        client,
        `
        SELECT
            id,
            root_id,
            box,
            path,
            hpath,
            type,
            content,
            markdown
        FROM blocks
        WHERE ${filters.join(' AND ')}
        ORDER BY updated DESC
        LIMIT 200
        `.trim(),
    );
}

export async function getBacklinkDocWithFallback(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<{ backlinks: unknown[]; backmentions: unknown[]; fallbackUsed?: boolean; sourcePayloadMissing?: boolean; fallbackQuery?: 'sql'; resultConfidence?: 'fallback' }> {
    const result = await searchApi.getBacklinkDoc(client, id, keyword, refTreeID);
    if (hasBacklinkPayload(result) && (Array.isArray(result.backlinks) || Array.isArray(result.backmentions))) {
        return {
            backlinks: Array.isArray(result.backlinks) ? result.backlinks : [],
            backmentions: Array.isArray(result.backmentions) ? result.backmentions : [],
        };
    }

    const [backlinks, backmentions] = await Promise.all([
        queryFallbackBacklinkRows(client, id, keyword, refTreeID),
        queryFallbackBackmentionRows(client, id, keyword, refTreeID),
    ]);
    return {
        backlinks,
        backmentions,
        fallbackUsed: true,
        sourcePayloadMissing: true,
        fallbackQuery: 'sql',
        resultConfidence: 'fallback',
    };
}

export async function getBackmentionDocWithFallback(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<{ backmentions: unknown[]; fallbackUsed?: boolean; sourcePayloadMissing?: boolean; fallbackQuery?: 'sql'; resultConfidence?: 'fallback' }> {
    const result = await searchApi.getBackmentionDoc(client, id, keyword, refTreeID);
    if (result && typeof result === 'object' && Array.isArray((result as { backmentions?: unknown[] }).backmentions)) {
        return { backmentions: (result as { backmentions: unknown[] }).backmentions };
    }

    const backmentions = await queryFallbackBackmentionRows(client, id, keyword, refTreeID);
    return {
        backmentions,
        fallbackUsed: true,
        sourcePayloadMissing: true,
        fallbackQuery: 'sql',
        resultConfidence: 'fallback',
    };
}
