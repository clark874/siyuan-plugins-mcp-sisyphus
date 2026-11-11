import type { SiYuanClient } from '../../api/client';
import { querySQLWithMeta } from '../../api/search';
import type { PermissionManager } from '../../core/permissions';
import { ensurePermissionForAvId, extractAvRowLookup } from '../av/handlers';
import { escapeSqlString } from '../internal/context';

const blockIdPattern = /^\d{14}-[a-z0-9]{7}$/;
const quote = (value: string) => `'${escapeSqlString(value)}'`;
const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();
const columnNames = {
    workstream: ['工作线'],
    objectRole: ['对象角色'],
    atomType: ['知识类型', '原子类型'],
    verificationStatus: ['核验状态', '验证状态'],
    compileStatus: ['编译状态'],
} as const;

type CatalogField = keyof typeof columnNames;
export type ProjectKnowledgeCatalogFilters = Partial<Record<CatalogField, string | string[]>>;

type CatalogMarker = {
    id: string;
    box: string;
    document_id: string;
    title: string;
    av_id: string;
    project_id: string;
};

type Catalog = {
    catalogBlockId: string;
    avId: string;
    projectId: string;
    documentId: string;
    title: string;
    url: string;
};

type Column = { field: CatalogField; columnId: string; name: string; type: string };

type Cell = {
    blockID?: string;
    text?: { content?: string };
    select?: { content?: string };
    mSelect?: Array<{ content?: string }>;
};

type KeyValues = {
    key?: { id?: string; name?: string; type?: string };
    values?: Cell[];
};

type Candidate = {
    blockId: string;
    rowId: string;
    title: string;
    url: string;
} & Partial<Record<CatalogField, string>>;

type BlockMetadata = {
    id: string;
    box: string;
    block_name?: string;
    block_content?: string;
    atom_type?: string;
    verification_status?: string;
    source_role?: string;
};

type CatalogReadResult = {
    status: 'ready' | 'catalog_not_found' | 'catalog_unavailable' | 'catalog_empty' | 'not_found' | 'unsupported_filters';
    candidates: Candidate[];
    catalog?: Catalog;
    columns?: Column[];
    unsupportedFilters?: string[];
    totalMatches?: number;
    hasMore?: boolean;
    nextOffset?: number | null;
};

async function findCatalogMarkers(
    client: SiYuanClient,
    permMgr: PermissionManager,
    selector: { projectId?: string; catalogBlockId?: string },
) {
    const scope = selector.catalogBlockId
        ? `b.id=${quote(selector.catalogBlockId)}`
        : `EXISTS (SELECT 1 FROM attributes scope WHERE scope.block_id=b.id
            AND scope.name='custom-knowledge-project-id' AND scope.value=${quote(selector.projectId ?? '')})`;
    const result = await querySQLWithMeta(client, `
        SELECT DISTINCT b.id,b.box,b.root_id AS document_id,substr(d.content,1,160) AS title,
            a.value AS av_id,p.value AS project_id
        FROM blocks b JOIN blocks d ON d.id=b.root_id
        JOIN attributes a ON a.block_id=b.id AND a.name='custom-knowledge-catalog'
        LEFT JOIN attributes p ON p.block_id=b.id AND p.name='custom-knowledge-project-id'
        WHERE b.type='av' AND ${scope} ORDER BY b.id LIMIT 51
    `);
    if (result.kernelTruncated || result.rows.length > 50) throw Error('知识目录发现范围超过上限。');
    return (result.rows as CatalogMarker[]).filter(row => blockIdPattern.test(row.id) && row.box && permMgr.canRead(row.box)
        && (!selector.catalogBlockId || row.id === selector.catalogBlockId));
}

function toCatalog(marker: CatalogMarker): Catalog | undefined {
    if (!blockIdPattern.test(marker.av_id) || !blockIdPattern.test(marker.document_id) || !marker.project_id?.trim()) return;
    return {
        catalogBlockId: marker.id,
        avId: marker.av_id,
        projectId: marker.project_id,
        documentId: marker.document_id,
        title: marker.title || '项目知识目录',
        url: `siyuan://blocks/${marker.id}`,
    };
}

export async function discoverProjectKnowledgeCatalogs(client: SiYuanClient, permMgr: PermissionManager, projectId: string) {
    await permMgr.reload();
    const markers = await findCatalogMarkers(client, permMgr, { projectId });
    const counts = new Map<string, number>();
    for (const marker of markers) counts.set(marker.id, (counts.get(marker.id) ?? 0) + 1);
    const catalogs = markers.flatMap(marker => {
        const catalog = counts.get(marker.id) === 1 && marker.project_id === projectId ? toCatalog(marker) : undefined;
        return catalog ? [catalog] : [];
    });
    if (markers.length && !catalogs.length) throw Error('项目知识目录的登记标记无效。');
    return catalogs;
}

function catalogColumns(entries: KeyValues[]): Column[] {
    return (Object.entries(columnNames) as [CatalogField, readonly string[]][]).flatMap(([field, names]) => {
        for (const name of names) {
            const keys = entries.flatMap(entry => entry?.key?.name === name ? [entry.key] : []);
            if (keys.length > 1) return [];
            const key = keys[0];
            if (key?.id && key.type && ['text', 'select', 'mSelect'].includes(key.type)) {
                return [{ field, columnId: key.id, name, type: key.type }];
            }
        }
        return [];
    });
}

function cellValues(cell: Cell): string[] {
    const values = [cell.text?.content, cell.select?.content, ...(Array.isArray(cell.mSelect)
        ? cell.mSelect.map(item => item?.content) : [])];
    return values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

async function readableMetadata(client: SiYuanClient, permMgr: PermissionManager, projectId: string, ids: string[], stopAtFirst = false) {
    const blocks = new Map<string, BlockMetadata>();
    for (let offset = 0; offset < ids.length; offset += 50) {
        const batch = ids.slice(offset, offset + 50);
        const result = await querySQLWithMeta(client, `
            SELECT b.id,b.box,b.name AS block_name,substr(b.content,1,160) AS block_content,
                (SELECT value FROM attributes WHERE block_id=b.id AND name='custom-atom-type' LIMIT 1) AS atom_type,
                (SELECT value FROM attributes WHERE block_id=b.id AND name='custom-verification-status' LIMIT 1) AS verification_status,
                (SELECT value FROM attributes WHERE block_id=b.id AND name='custom-source-role' LIMIT 1) AS source_role
            FROM blocks b WHERE b.id IN (${batch.map(quote).join(',')})
            AND EXISTS (SELECT 1 FROM attributes scope WHERE scope.block_id=b.id
                AND scope.name IN ('custom-source-project-id','custom-knowledge-project-id') AND scope.value=${quote(projectId)})
            AND NOT EXISTS (SELECT 1 FROM attributes scope WHERE scope.block_id=b.id
                AND scope.name IN ('custom-source-project-id','custom-knowledge-project-id') AND scope.value<>${quote(projectId)})
            LIMIT ${batch.length}
        `);
        if (result.kernelTruncated) throw Error('知识目录绑定块的查询未完整返回。');
        for (const row of result.rows as BlockMetadata[]) {
            if (!batch.includes(row.id) || !row.box || !permMgr.canRead(row.box)) continue;
            blocks.set(row.id, row);
            if (stopAtFirst) return blocks;
        }
    }
    return blocks;
}

export async function readProjectKnowledgeCatalog(
    client: SiYuanClient,
    permMgr: PermissionManager,
    args: { catalogBlockId: string; projectId?: string; filters?: ProjectKnowledgeCatalogFilters; offset?: number; limit?: number },
): Promise<CatalogReadResult> {
    const empty = (status: CatalogReadResult['status']): CatalogReadResult => ({ status, candidates: [] });
    if (!blockIdPattern.test(args.catalogBlockId)) return empty('catalog_not_found');
    try {
        await permMgr.reload();
        const markers = await findCatalogMarkers(client, permMgr, { catalogBlockId: args.catalogBlockId });
        if (!markers.length || (args.projectId && !markers.some(row => row.project_id === args.projectId))) {
            return empty('catalog_not_found');
        }
        const catalog = markers.length === 1 ? toCatalog(markers[0]) : undefined;
        if (!catalog) return empty('catalog_unavailable');
        const permission = await ensurePermissionForAvId(client, permMgr, catalog.avId, 'read', {
            blockID: catalog.catalogBlockId, databaseBlocksOnly: true,
        });
        const entries = (permission.avData as { keyValues?: KeyValues[] } | null)?.keyValues;
        if (permission.denied || !Array.isArray(entries)) return empty('catalog_unavailable');
        const columns = catalogColumns(entries);
        const filters = Object.entries(args.filters ?? {}) as [CatalogField, string | string[]][];
        const unsupportedFilters = filters
            .filter(([field]) => !columns.some(column => column.field === field))
            .map(([field]) => field);
        if (unsupportedFilters.length) return { ...empty('unsupported_filters'), catalog, columns, unsupportedFilters };

        const lookup = extractAvRowLookup(permission.avData);
        if (lookup.rows.length > 2000) return empty('catalog_unavailable');
        const bindings = lookup.rows.filter((row): row is typeof row & { rowID: string; sourceBlockID: string } =>
            Boolean(row.rowID && row.sourceBlockID && blockIdPattern.test(row.sourceBlockID)));

        const valuesByRow = new Map<string, Partial<Record<CatalogField, string[]>>>();
        const fieldByColumn = new Map(columns.map(column => [column.columnId, column.field]));
        for (const entry of entries) {
            const field = entry?.key?.id ? fieldByColumn.get(entry.key.id) : undefined;
            if (!field || !Array.isArray(entry.values)) continue;
            for (const cell of entry.values) {
                if (!cell?.blockID) continue;
                const fields = valuesByRow.get(cell.blockID) ?? {};
                fields[field] = cellValues(cell);
                valuesByRow.set(cell.blockID, fields);
            }
        }

        const expected = filters.map(([field, value]) => [field, (Array.isArray(value) ? value : [value]).map(normalize)] as const);
        const directoryFilters = expected.filter(([field]) => field !== 'atomType' && field !== 'verificationStatus');
        const matchingBindings = bindings.filter(binding => directoryFilters.every(([field, options]) =>
            valuesByRow.get(binding.rowID)?.[field]?.some(value => options.includes(normalize(value)))));
        const blocks = await readableMetadata(client, permMgr, catalog.projectId,
            [...new Set(matchingBindings.map(row => row.sourceBlockID))]);
        const hasReadableBindings = blocks.size > 0 || (matchingBindings.length < bindings.length &&
            (await readableMetadata(client, permMgr, catalog.projectId,
                [...new Set(bindings.map(row => row.sourceBlockID))], true)).size > 0);
        const candidates: Candidate[] = [];
        const matchedIds = new Set<string>();
        for (const binding of matchingBindings) {
            const block = blocks.get(binding.sourceBlockID);
            if (!block || matchedIds.has(block.id)) continue;
            const values = { ...valuesByRow.get(binding.rowID) };
            // 分类和核验以知识块属性为准，历史表格值不提供证据等级。
            values.atomType = block.atom_type ? [block.atom_type] : [];
            values.verificationStatus = block.verification_status ? [block.verification_status] : [];
            if (!expected.every(([field, options]) => values[field]?.some(value => options.includes(normalize(value))))) continue;
            matchedIds.add(block.id);
            candidates.push({
                blockId: block.id, rowId: binding.rowID,
                title: (block.block_name || block.block_content || '知识块').slice(0, 160),
                url: `siyuan://blocks/${block.id}`,
                ...Object.fromEntries(Object.entries(values).filter(([, value]) => value.length)
                    .map(([field, value]) => [field, value.join('、').slice(0, 160)])),
            });
        }

        const offset = Math.max(0, Math.trunc(args.offset ?? 0));
        const limit = Math.max(1, Math.min(500, Math.trunc(args.limit ?? 20)));
        const page = candidates.slice(offset, offset + limit);
        const hasMore = offset + page.length < candidates.length;
        return {
            status: !hasReadableBindings ? 'catalog_empty' : page.length === 0 ? 'not_found' : 'ready',
            catalog, columns, candidates: page, totalMatches: candidates.length, hasMore,
            nextOffset: hasMore ? offset + page.length : null,
        };
    } catch {
        return empty('catalog_unavailable');
    }
}

export async function verifyProjectKnowledgeCatalogBindings(
    client: SiYuanClient, permMgr: PermissionManager, projectId: string, workstream: string,
    atomIds: string[], sourceRows: Array<{ id: string; status: string }>,
) {
    const catalogs = await discoverProjectKnowledgeCatalogs(client, permMgr, projectId);
    if (catalogs.length !== 1) throw new Error('项目必须有一个可确认的知识目录，保留批次待续接。');
    const catalog = catalogs[0];
    const permission = await ensurePermissionForAvId(client, permMgr, catalog.avId, 'read', {
        blockID: catalog.catalogBlockId, databaseBlocksOnly: true,
    });
    const entries = (permission.avData as { keyValues?: KeyValues[] } | null)?.keyValues;
    if (permission.denied || !entries) throw new Error('项目知识目录不可读，保留批次待续接。');
    const ids = [...new Set([...atomIds, ...sourceRows.map(row => row.id)])];
    const metadata = await readableMetadata(client, permMgr, projectId, ids);
    const columns = catalogColumns(entries);
    const bindings = extractAvRowLookup(permission.avData).rows;
    const matches = (rowId: string, field: CatalogField, expected: string) => {
        const column = columns.find(column => column.field === field);
        const cell = entries.find(entry => entry.key?.id === column?.columnId)?.values?.find(value => value.blockID === rowId);
        return cell && cellValues(cell).some(value => normalize(value) === normalize(expected));
    };
    for (const id of ids) {
        const rows = bindings.filter(row => row.sourceBlockID === id && row.rowID);
        const rowId = rows[0]?.rowID;
        const block = metadata.get(id);
        const sources = sourceRows.filter(row => row.id === id);
        const role = sources.length ? block?.source_role : block?.atom_type && 'atom';
        if (rows.length !== 1 || !rowId || !role || (sources.length > 0 && !['source-document', 'source-entry'].includes(role))
            || !matches(rowId, 'workstream', workstream) || !matches(rowId, 'objectRole', role)
            || sources.some(source => !matches(rowId, 'compileStatus', source.status))) {
            throw new Error('项目知识目录缺少本批对象的有效绑定或字段，保留批次待续接。');
        }
    }
}
