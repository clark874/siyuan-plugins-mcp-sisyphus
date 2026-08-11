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

export interface RecentDocumentDiffSummary {
    status: 'ready' | 'no_history' | 'no_different_history' | 'error';
    changedBlocks: number;
    addedLines: number;
    removedLines: number;
    baselineCreated: string;
}

export interface RecentDocumentGroup {
    key: string;
    label: string;
    documents: RecentDocumentView[];
    collapsedByDefault: boolean;
}

export interface RecentDocumentGroupingOptions {
    now?: Date;
    locale?: string;
    todayLabel?: string;
    yesterdayLabel?: string;
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

export function groupRecentDocuments(
    documents: RecentDocumentView[],
    options: RecentDocumentGroupingOptions = {},
): RecentDocumentGroup[] {
    const now = options.now ?? new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const groups = new Map<string, RecentDocumentGroup>();

    for (const document of documents) {
        const date = parseSiYuanTimestamp(document.updated);
        const bucket = date
            ? recentDocumentDateBucket(date, startOfToday, options)
            : { key: 'unknown', label: '—', collapsedByDefault: true };
        const existing = groups.get(bucket.key);
        if (existing) {
            existing.documents.push(document);
        } else {
            groups.set(bucket.key, { ...bucket, documents: [document] });
        }
    }

    return [...groups.values()];
}

function normalizeSiYuanTimestamp(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return /^\d{14}$/.test(trimmed) ? trimmed : '';
}

function parseSiYuanTimestamp(value: unknown): Date | undefined {
    const normalized = normalizeSiYuanTimestamp(value);
    if (!normalized) return undefined;
    const date = new Date(
        Number(normalized.slice(0, 4)),
        Number(normalized.slice(4, 6)) - 1,
        Number(normalized.slice(6, 8)),
        Number(normalized.slice(8, 10)),
        Number(normalized.slice(10, 12)),
        Number(normalized.slice(12, 14)),
    );
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function recentDocumentDateBucket(
    date: Date,
    startOfToday: Date,
    options: RecentDocumentGroupingOptions,
): Omit<RecentDocumentGroup, 'documents'> {
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDistance = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
    const dateKey = `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

    if (dayDistance >= 0 && dayDistance < 7) {
        const label = dayDistance === 0
            ? options.todayLabel ?? 'Today'
            : dayDistance === 1
                ? options.yesterdayLabel ?? 'Yesterday'
                : new Intl.DateTimeFormat(options.locale, {
                    month: '2-digit',
                    day: '2-digit',
                    weekday: 'short',
                }).format(date);
        return { key: `day:${dateKey}`, label, collapsedByDefault: false };
    }

    const monthKey = `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}`;
    return {
        key: `month:${monthKey}`,
        label: new Intl.DateTimeFormat(options.locale, { year: 'numeric', month: 'long' }).format(date),
        collapsedByDefault: true,
    };
}

function twoDigits(value: number): string {
    return String(value).padStart(2, '0');
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
