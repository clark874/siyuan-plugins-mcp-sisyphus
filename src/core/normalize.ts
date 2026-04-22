export interface MarkdownContentResult {
    content: string;
}

const ZERO_WIDTH_CHARS = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;

export function stripZeroWidthChars(value: string): string {
    return value.replace(ZERO_WIDTH_CHARS, '');
}

export function normalizeMarkdownContent<T extends MarkdownContentResult>(value: T): T {
    return {
        ...value,
        content: stripZeroWidthChars(value.content),
    };
}

export function normalizeKramdownResult<T extends { kramdown: string }>(value: T): T {
    return {
        ...value,
        kramdown: stripZeroWidthChars(value.kramdown),
    };
}

export function stripHtmlTags(value: string): string {
    return value.replace(HTML_TAG_PATTERN, '');
}

function normalizeAliasKey(value: string | undefined): string | undefined {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : undefined;
}

/* ------------------------------------------------------------------ */
/*  Type shortcode expansion                                          */
/* ------------------------------------------------------------------ */

const TYPE_SHORTCODE_MAP: Record<string, string> = {
    d: 'document',
    h: 'heading',
    p: 'paragraph',
    l: 'list',
    i: 'listItem',
    b: 'blockquote',
    c: 'codeBlock',
    m: 'mathBlock',
    t: 'table',
    s: 'superBlock',
    html: 'htmlBlock',
    embed: 'embedBlock',
    av: 'databaseBlock',
    video: 'video',
    audio: 'audio',
    widget: 'widget',
};

const SEARCH_METHOD_ALIAS_MAP: Record<string, number> = {
    keyword: 0,
    query: 1,
    query_syntax: 1,
    sql: 2,
    regex: 3,
};

const SEARCH_METHOD_NAME_MAP: Record<number, string> = {
    0: 'keyword',
    1: 'query_syntax',
    2: 'sql',
    3: 'regex',
};

export function expandTypeShortcodes(shortcodes: string[]): Record<string, boolean> {
    const types: Record<string, boolean> = {};
    for (const code of shortcodes) {
        const fullName = TYPE_SHORTCODE_MAP[code];
        if (fullName) {
            types[fullName] = true;
        }
    }
    return types;
}

/**
 * Auto-expand shortcodes found as keys in a types Record.
 * e.g. {"h": true, "paragraph": true} → {"heading": true, "paragraph": true}
 */
export function resolveTypeRecord(types: Record<string, boolean>): Record<string, boolean> {
    const resolved: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(types)) {
        const fullName = TYPE_SHORTCODE_MAP[key];
        if (fullName) {
            resolved[fullName] = value;
        } else {
            resolved[key] = value;
        }
    }
    return resolved;
}

export function resolveSearchMethod(methodName: string | undefined, method: number | undefined): number | undefined {
    const normalizedMethodName = normalizeAliasKey(methodName);
    if (normalizedMethodName && normalizedMethodName in SEARCH_METHOD_ALIAS_MAP) {
        return SEARCH_METHOD_ALIAS_MAP[normalizedMethodName];
    }
    return method;
}

export function getSearchMethodName(method: number | undefined): string | undefined {
    if (method === undefined) return undefined;
    return SEARCH_METHOD_NAME_MAP[method];
}

/* ------------------------------------------------------------------ */
/*  Sort alias resolution                                             */
/* ------------------------------------------------------------------ */

const FULLTEXT_SORT_ALIAS_MAP: Record<string, number> = {
    relevance: 7,
    date: 4,
    updated_desc: 4,
    updated_asc: 3,
    created_desc: 2,
    created_asc: 1,
    type: 0,
};

const FULLTEXT_SORT_NAME_MAP: Record<number, string> = {
    7: 'relevance',
    4: 'updated_desc',
    3: 'updated_asc',
    2: 'created_desc',
    1: 'created_asc',
    0: 'type',
};

const ASSET_CONTENT_SORT_ALIAS_MAP: Record<string, number> = {
    relevance: 0,
    relevance_desc: 0,
    relevance_asc: 1,
    updated_asc: 2,
    updated_desc: 3,
};

const ASSET_CONTENT_SORT_NAME_MAP: Record<number, string> = {
    0: 'relevance_desc',
    1: 'relevance_asc',
    2: 'updated_asc',
    3: 'updated_desc',
};

export function resolveSortAlias(
    sortBy: string | undefined,
    orderBy: number | undefined,
    aliasMap: Record<string, number> = FULLTEXT_SORT_ALIAS_MAP,
): number | undefined {
    const normalizedSortBy = normalizeAliasKey(sortBy);
    if (normalizedSortBy && normalizedSortBy in aliasMap) {
        return aliasMap[normalizedSortBy];
    }
    return orderBy;
}

export function getFulltextSortName(orderBy: number | undefined): string | undefined {
    if (orderBy === undefined) return undefined;
    return FULLTEXT_SORT_NAME_MAP[orderBy];
}

export function resolveAssetContentSortAlias(sortBy: string | undefined, orderBy: number | undefined): number | undefined {
    return resolveSortAlias(sortBy, orderBy, ASSET_CONTENT_SORT_ALIAS_MAP);
}

export function getAssetContentSortName(orderBy: number | undefined): string | undefined {
    if (orderBy === undefined) return undefined;
    return ASSET_CONTENT_SORT_NAME_MAP[orderBy];
}

export function normalizeFullTextSearchResult<T extends { blocks?: unknown[] }>(
    value: T,
    stripHtml: boolean,
): T {
    if (!stripHtml || !Array.isArray(value.blocks)) {
        return value;
    }

    return {
        ...value,
        blocks: value.blocks.map((block) => {
            if (!block || typeof block !== 'object') {
                return block;
            }

            const typedBlock = block as Record<string, unknown>;
            const nextBlock = { ...typedBlock };
            const content = typeof typedBlock.content === 'string' ? typedBlock.content : undefined;
            if (content !== undefined) {
                nextBlock.plainContent = stripHtmlTags(content);
            }
            return nextBlock;
        }),
    };
}

/* ------------------------------------------------------------------ */
/*  Search result slimming — reduce noise for AI consumption          */
/* ------------------------------------------------------------------ */

const ESSENTIAL_FIELDS = ['id', 'type', 'box'] as const;
const HPATH_FIELDS = ['hPath', 'hpath'] as const;
const OPTIONAL_FIELDS = [
    'content', 'plainContent', 'markdown',
    'name', 'alias', 'memo', 'tag',
    'subType', 'subtype',
    'path', 'parentID', 'parent_id',
    'rootID', 'root_id',
] as const;

function isNonEmpty(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
}

export function slimBlockFields(block: Record<string, unknown>): Record<string, unknown> {
    const slim: Record<string, unknown> = {};
    for (const key of ESSENTIAL_FIELDS) {
        if (key in block) slim[key] = block[key];
    }
    for (const key of HPATH_FIELDS) {
        if (isNonEmpty(block[key])) { slim.hPath = block[key]; break; }
    }
    for (const key of OPTIONAL_FIELDS) {
        if (isNonEmpty(block[key])) slim[key] = block[key];
    }
    return slim;
}

const MARK_RE = /<mark>[^<]*<\/mark>/g;
const SHORT_THRESHOLD = 400;
const DEFAULT_WINDOW = 150;

export function truncateContentAroundMarks(text: string, windowSize: number = DEFAULT_WINDOW): string {
    if (text.length <= SHORT_THRESHOLD) return text;

    const matches = [...text.matchAll(MARK_RE)];
    if (matches.length === 0) {
        return text.length > SHORT_THRESHOLD ? text.slice(0, SHORT_THRESHOLD) + '...' : text;
    }

    // Build windows around each <mark> match
    const windows: Array<[number, number]> = [];
    for (const m of matches) {
        const start = Math.max(0, m.index! - windowSize);
        const end = Math.min(text.length, m.index! + m[0].length + windowSize);
        windows.push([start, end]);
    }

    // Merge overlapping / adjacent windows
    const merged: Array<[number, number]> = [windows[0]];
    for (let i = 1; i < windows.length; i++) {
        const prev = merged[merged.length - 1];
        const cur = windows[i];
        if (cur[0] <= prev[1]) {
            prev[1] = Math.max(prev[1], cur[1]);
        } else {
            merged.push(cur);
        }
    }

    // Build result
    const parts: string[] = [];
    if (merged[0][0] > 0) parts.push('...');
    for (let i = 0; i < merged.length; i++) {
        if (i > 0) parts.push('...');
        parts.push(text.slice(merged[i][0], merged[i][1]));
    }
    if (merged[merged.length - 1][1] < text.length) parts.push('...');

    return parts.join('');
}

const MARKDOWN_MAX = 400;
const EXCERPT_LENGTH = 200;

export function slimSearchBlocks(blocks: unknown[]): unknown[] {
    return blocks.map((block) => {
        if (!block || typeof block !== 'object') return block;
        const typed = block as Record<string, unknown>;
        const slim = slimBlockFields(typed);

        // NodeDocument content is just the title — no truncation needed
        if (slim.type === 'NodeDocument') return slim;

        if (typeof slim.content === 'string') {
            const plainText = stripHtmlTags(slim.content as string).trim();
            if (plainText.length > 0) {
                slim.excerpt = plainText.length > EXCERPT_LENGTH
                    ? plainText.slice(0, EXCERPT_LENGTH) + '...'
                    : plainText;
            }
            slim.content = truncateContentAroundMarks(slim.content);
        }
        if (typeof slim.markdown === 'string' && (slim.markdown as string).length > MARKDOWN_MAX) {
            slim.markdown = (slim.markdown as string).slice(0, MARKDOWN_MAX) + '...';
        }
        return slim;
    });
}

export function normalizeSearchBlocksForAi(blocks: unknown[]): unknown[] {
    const normalized = normalizeFullTextSearchResult({ blocks }, true);
    return slimSearchBlocks(Array.isArray(normalized.blocks) ? normalized.blocks : []);
}
