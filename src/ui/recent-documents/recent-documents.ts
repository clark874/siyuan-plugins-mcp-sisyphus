export interface RecentDocumentRecord {
    rootID: string;
    title?: string;
    icon?: string;
}

export interface RecentDocumentMetadataRow {
    id: string;
    box?: string;
    hpath?: string;
    updated?: string;
}

export interface RecentDocumentView {
    id: string;
    title: string;
    icon: string;
    notebook: string;
    hPath: string;
    parentPath: string;
    updated: string;
}

const SIYUAN_DOCUMENT_ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;
const MAX_RECENT_DOCUMENT_IDS = 256;

export function buildRecentDocumentMetadataSql(ids: string[]): string {
    const validIds = [...new Set(ids)]
        .filter((id) => SIYUAN_DOCUMENT_ID_PATTERN.test(id))
        .slice(0, MAX_RECENT_DOCUMENT_IDS);
    if (validIds.length === 0) {
        return "SELECT id, box, hpath, updated FROM blocks WHERE type = 'd' AND 1 = 0";
    }
    const quoted = validIds.map((id) => `'${id}'`).join(', ');
    return `SELECT id, box, hpath, updated FROM blocks WHERE type = 'd' AND id IN (${quoted})`;
}

export function mergeRecentDocumentMetadata(
    records: RecentDocumentRecord[],
    rows: RecentDocumentMetadataRow[],
): RecentDocumentView[] {
    const metadataById = new Map(rows.map((row) => [row.id, row]));
    return records
        .filter((record) => SIYUAN_DOCUMENT_ID_PATTERN.test(record.rootID))
        .map((record) => {
            const metadata = metadataById.get(record.rootID);
            const hPath = normalizeHPath(metadata?.hpath);
            return {
                id: record.rootID,
                title: record.title?.trim() || lastPathSegment(hPath) || record.rootID,
                icon: record.icon?.trim() || '',
                notebook: metadata?.box?.trim() || '',
                hPath,
                parentPath: parentHPath(hPath),
                updated: normalizeSiYuanTimestamp(metadata?.updated),
            };
        });
}

export function formatRecentDocumentTime(value: string, locale?: string): string {
    const normalized = normalizeSiYuanTimestamp(value);
    if (!normalized) return '';
    const date = new Date(
        Number(normalized.slice(0, 4)),
        Number(normalized.slice(4, 6)) - 1,
        Number(normalized.slice(6, 8)),
        Number(normalized.slice(8, 10)),
        Number(normalized.slice(10, 12)),
        Number(normalized.slice(12, 14)),
    );
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export function recentDocumentMatches(document: RecentDocumentView, query: string): boolean {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return true;
    return [document.title, document.hPath, document.parentPath]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function normalizeSiYuanTimestamp(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return /^\d{14}$/.test(trimmed) ? trimmed : '';
}

function normalizeHPath(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    const normalized = value.trim().replace(/\/{2,}/g, '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function lastPathSegment(path: string): string {
    return path.split('/').filter(Boolean).at(-1) ?? '';
}

function parentHPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 1) return '';
    return `/${segments.slice(0, -1).join('/')}`;
}
