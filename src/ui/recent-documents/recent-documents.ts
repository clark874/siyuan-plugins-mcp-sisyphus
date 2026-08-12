export interface RecentDocumentMetadataRow {
    id: string;
    box?: string;
    hpath?: string;
    path?: string;
    content?: string;
    updated?: string;
    ial?: string;
}

export interface RecentDocumentView {
    id: string;
    title: string;
    icon: string;
    notebook: string;
    hPath: string;
    parentPath: string;
    storagePath: string;
    updated: string;
}

export type RecentDocumentDiffStatus =
    | 'content_changed'
    | 'title_changed'
    | 'same_content_checkpoint'
    | 'no_history'
    | 'history_insufficient'
    | 'error';

export interface RecentDocumentDiffSummary {
    status: RecentDocumentDiffStatus;
    changedBlocks: number;
    addedLines: number;
    removedLines: number;
    baselineCreated: string;
    documentUpdated: string;
}

export type RecentDocumentGranularity = 'day' | 'month' | 'year';
export type RecentDocumentFilter = 'all' | 'content' | 'structure' | 'insufficient';
export type RecentDocumentGroupLevel = 'year' | 'month' | 'day';

export interface RecentDocumentGroup {
    key: string;
    label: string;
    level: RecentDocumentGroupLevel;
    documents: RecentDocumentView[];
    children: RecentDocumentGroup[];
    documentCount: number;
    collapsedByDefault: boolean;
}

export interface RecentDocumentGroupingOptions {
    now?: Date;
    locale?: string;
    todayLabel?: string;
    yesterdayLabel?: string;
    granularity?: RecentDocumentGranularity;
}

const MAX_PAGE_SIZE = 200;

export function buildRecentDocumentsPageSql(pageValue: number, pageSizeValue: number): string {
    const page = Math.max(1, Math.floor(Number.isFinite(pageValue) ? pageValue : 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number.isFinite(pageSizeValue) ? pageSizeValue : 100)));
    const offset = (page - 1) * pageSize;
    return [
        'SELECT id, box, hpath, path, content, updated, ial',
        "FROM blocks WHERE type = 'd'",
        'ORDER BY updated DESC, id DESC',
        `LIMIT ${pageSize} OFFSET ${offset}`,
    ].join(' ');
}

export function mapRecentDocumentRows(rows: RecentDocumentMetadataRow[]): RecentDocumentView[] {
    return rows
        .filter((row) => isSiYuanDocumentId(row.id))
        .map((row) => {
            const hPath = normalizeHPath(row.hpath);
            return {
                id: row.id,
                title: normalizeText(row.content) || lastPathSegment(hPath) || row.id,
                icon: extractIcon(row.ial),
                notebook: normalizeText(row.box),
                hPath,
                parentPath: parentHPath(hPath),
                storagePath: normalizeStoragePath(row.path),
                updated: normalizeSiYuanTimestamp(row.updated),
            };
        });
}

export function formatRecentDocumentTime(value: string, locale?: string): string {
    const date = parseSiYuanTimestamp(value);
    if (!date) return '';
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

export function filterRecentDocuments(
    documents: RecentDocumentView[],
    summaries: Record<string, RecentDocumentDiffSummary>,
    filter: RecentDocumentFilter,
): RecentDocumentView[] {
    if (filter === 'all') return documents;
    return documents.filter((document) => {
        const summary = summaries[document.id];
        const status = summary?.documentUpdated === document.updated ? summary.status : undefined;
        if (!status) return false;
        if (filter === 'content') return status === 'content_changed';
        if (filter === 'structure') return status === 'title_changed';
        return status === 'same_content_checkpoint' || status === 'no_history' || status === 'history_insufficient' || status === 'error';
    });
}

export function groupRecentDocuments(
    documents: RecentDocumentView[],
    options: RecentDocumentGroupingOptions = {},
): RecentDocumentGroup[] {
    const now = options.now ?? new Date();
    const granularity = options.granularity ?? 'day';
    const years = new Map<string, RecentDocumentGroup>();

    for (const document of documents) {
        const date = parseSiYuanTimestamp(document.updated);
        if (!date) {
            appendUnknownDocument(years, document);
            continue;
        }
        const yearKey = `year:${date.getFullYear()}`;
        const year = ensureGroup(years, {
            key: yearKey,
            label: new Intl.DateTimeFormat(options.locale, { year: 'numeric' }).format(date),
            level: 'year',
            collapsedByDefault: date.getFullYear() !== now.getFullYear(),
        });

        if (granularity === 'year') {
            year.documents.push(document);
            year.documentCount += 1;
            continue;
        }

        const monthKey = `month:${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}`;
        let month = year.children.find((group) => group.key === monthKey);
        if (!month) {
            month = createGroup({
                key: monthKey,
                label: new Intl.DateTimeFormat(options.locale, { month: 'long' }).format(date),
                level: 'month',
                collapsedByDefault: date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth(),
            });
            year.children.push(month);
        }
        year.documentCount += 1;

        if (granularity === 'month') {
            month.documents.push(document);
            month.documentCount += 1;
            continue;
        }

        const dayKey = `day:${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
        let day = month.children.find((group) => group.key === dayKey);
        if (!day) {
            day = createGroup({
                key: dayKey,
                label: formatDayLabel(date, now, options),
                level: 'day',
                collapsedByDefault: dayDistance(date, now) > 0,
            });
            month.children.push(day);
        }
        month.documentCount += 1;
        day.documentCount += 1;
        day.documents.push(document);
    }

    return [...years.values()];
}

export function collectRecentDocumentGroupKeys(groups: RecentDocumentGroup[]): string[] {
    const keys: string[] = [];
    const visit = (items: RecentDocumentGroup[]) => {
        for (const group of items) {
            keys.push(group.key);
            visit(group.children);
        }
    };
    visit(groups);
    return keys;
}

export function mergeCollapsedGroupState(
    previous: Set<string>,
    groups: RecentDocumentGroup[],
    knownKeys: Set<string>,
): Set<string> {
    const next = new Set<string>();
    const visit = (items: RecentDocumentGroup[]) => {
        for (const group of items) {
            if (knownKeys.has(group.key) ? previous.has(group.key) : group.collapsedByDefault) {
                next.add(group.key);
            }
            visit(group.children);
        }
    };
    visit(groups);
    return next;
}

function appendUnknownDocument(years: Map<string, RecentDocumentGroup>, document: RecentDocumentView) {
    const unknown = ensureGroup(years, {
        key: 'year:unknown',
        label: '—',
        level: 'year',
        collapsedByDefault: true,
    });
    unknown.documents.push(document);
    unknown.documentCount += 1;
}

function ensureGroup(
    groups: Map<string, RecentDocumentGroup>,
    input: Pick<RecentDocumentGroup, 'key' | 'label' | 'level' | 'collapsedByDefault'>,
): RecentDocumentGroup {
    const existing = groups.get(input.key);
    if (existing) return existing;
    const group = createGroup(input);
    groups.set(input.key, group);
    return group;
}

function createGroup(
    input: Pick<RecentDocumentGroup, 'key' | 'label' | 'level' | 'collapsedByDefault'>,
): RecentDocumentGroup {
    return { ...input, documents: [], children: [], documentCount: 0 };
}

function formatDayLabel(date: Date, now: Date, options: RecentDocumentGroupingOptions): string {
    const distance = dayDistance(date, now);
    if (distance === 0) return options.todayLabel ?? 'Today';
    if (distance === 1) return options.yesterdayLabel ?? 'Yesterday';
    return new Intl.DateTimeFormat(options.locale, {
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    }).format(date);
}

function dayDistance(date: Date, now: Date): number {
    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((startOfNow.getTime() - startOfDate.getTime()) / 86_400_000);
}

function extractIcon(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.match(/(?:^|\s)icon="([^"]*)"/)?.[1]?.trim() ?? '';
}

function isSiYuanDocumentId(value: unknown): value is string {
    return typeof value === 'string' && /^\d{14}-[0-9a-z]{7}$/.test(value);
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeSiYuanTimestamp(value: unknown): string {
    const trimmed = normalizeText(value);
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

function twoDigits(value: number): string {
    return String(value).padStart(2, '0');
}

function normalizeHPath(value: unknown): string {
    const trimmed = normalizeText(value);
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\/{2,}/g, '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeStoragePath(value: unknown): string {
    const trimmed = normalizeText(value);
    if (!trimmed) return '';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function lastPathSegment(path: string): string {
    return path.split('/').filter(Boolean).at(-1) ?? '';
}

function parentHPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 1) return '';
    return `/${segments.slice(0, -1).join('/')}`;
}
