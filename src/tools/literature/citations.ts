import type { SiYuanClient } from '../../api/client';
import * as searchApi from '../../api/search';
import { escapeSqlString } from '../internal/context';

export async function queryDocumentCitations(
    client: SiYuanClient,
    documentId: string,
    limit: number,
    offset: number,
    sourceDocumentId?: string,
): Promise<{ rows: unknown[]; hasMore: boolean; kernelTruncated: boolean }> {
    const filters = [`r.def_block_root_id = '${escapeSqlString(documentId)}'`, "r.type = 'textmark'"];
    if (sourceDocumentId) filters.push(`r.root_id = '${escapeSqlString(sourceDocumentId)}'`);
    const result = await searchApi.querySQLWithMeta(client, `
        SELECT r.id AS refId, r.block_id AS sourceBlockId, r.root_id AS sourceDocumentId,
               r.def_block_id AS targetBlockId, r.content AS anchorText,
               COALESCE(b.box, r.box) AS box, b.path AS path, b.hpath AS sourceHpath,
               substr(b.content, 1, 320) AS sourceText, substr(t.content, 1, 320) AS targetText,
               t.type AS targetType
        FROM refs r
        LEFT JOIN blocks b ON b.id = r.block_id
        LEFT JOIN blocks t ON t.id = r.def_block_id
        WHERE ${filters.join(' AND ')}
        ORDER BY r.root_id, r.block_id, r.id
        LIMIT ${limit + 1} OFFSET ${offset}
    `);
    return {
        rows: result.rows.slice(0, limit),
        hasMore: result.rows.length > limit,
        kernelTruncated: result.kernelTruncated,
    };
}
