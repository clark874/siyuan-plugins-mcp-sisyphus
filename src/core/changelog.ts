import rawChangelog from '../../CHANGELOG.md?raw';

declare const __PLUGIN_VERSION__: string | undefined;

export const CHANGELOG_RESOURCE_URI = 'siyuan://help/changelog';

const DEFAULT_CHANGELOG_LIMIT = 5;
const MAX_CHANGELOG_LIMIT = 50;

const PERSONALIZATION_PATTERNS: Array<{ area: string; pattern: RegExp }> = [
    { area: 'tool-config', pattern: /工具配置|tool config|action|聚合工具|工具设置|settings panel|设置面板/i },
    { area: 'user-rules', pattern: /用户规则|custom rules|USER_RULES|个性化|偏好/i },
    { area: 'agent-memory', pattern: /AGENTS\.md|Agent 记忆|workspace memory|虚拟.*记忆/i },
    { area: 'permissions', pattern: /权限|permission|dangerous|确认|高风险/i },
    { area: 'connection', pattern: /MCP|HTTP|HTTPS|stdio|CLI|Docker|远程|连接|token|profile|环境变量/i },
    { area: 'appearance', pattern: /主题|配色|外观|猫猫|i18n|国际化|语言/i },
    { area: 'timeline', pattern: /文档时间线|timeline|Dock|侧边栏|历史版本/i },
];

export interface ChangelogImpact {
    mayAffectPersonalization: boolean;
    areas: string[];
    matchedItems: string[];
}

export interface ChangelogEntry {
    version: string;
    date?: string;
    title: string;
    items: string[];
    rawMarkdown: string;
    personalizationImpact: ChangelogImpact;
}

export interface ChangelogQuery {
    version?: string;
    fromVersion?: string;
    limit?: number;
    includeRaw?: boolean;
}

function normalizeVersion(version: string): string {
    return version.trim().replace(/^v/i, '');
}

function getBundledPluginVersion(entries: ChangelogEntry[]): string {
    if (typeof __PLUGIN_VERSION__ === 'string' && __PLUGIN_VERSION__.trim()) {
        return normalizeVersion(__PLUGIN_VERSION__);
    }
    return entries[0]?.version ?? '0.0.0';
}

function compareVersions(left: string, right: string): number {
    const leftParts = normalizeVersion(left).split(/[.-]/).map((part) => Number.parseInt(part, 10));
    const rightParts = normalizeVersion(right).split(/[.-]/).map((part) => Number.parseInt(part, 10));
    const length = Math.max(leftParts.length, rightParts.length, 3);

    for (let index = 0; index < length; index++) {
        const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
        const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
        if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
    }

    return 0;
}

function collectItems(section: string): string[] {
    return section
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim())
        .filter(Boolean);
}

function analyzeImpact(items: string[], rawMarkdown: string): ChangelogImpact {
    const areas = new Set<string>();
    const matchedItems: string[] = [];

    for (const item of items) {
        const matchedAreas = PERSONALIZATION_PATTERNS
            .filter(({ pattern }) => pattern.test(item))
            .map(({ area }) => area);
        if (matchedAreas.length === 0) continue;
        matchedAreas.forEach((area) => areas.add(area));
        matchedItems.push(item);
    }

    if (matchedItems.length === 0) {
        for (const { area, pattern } of PERSONALIZATION_PATTERNS) {
            if (pattern.test(rawMarkdown)) areas.add(area);
        }
    }

    return {
        mayAffectPersonalization: areas.size > 0,
        areas: [...areas].sort(),
        matchedItems,
    };
}

export function parseChangelog(markdown = rawChangelog): ChangelogEntry[] {
    const matches = [...markdown.matchAll(/^##\s+(v?[0-9][^\s]*)\s*(?:-\s*(.+))?\s*$/gm)];

    return matches.map((match, index) => {
        const start = match.index ?? 0;
        const end = matches[index + 1]?.index ?? markdown.length;
        const rawMarkdown = markdown.slice(start, end).trim();
        const items = collectItems(rawMarkdown);
        const version = normalizeVersion(match[1] ?? '');
        return {
            version,
            date: match[2]?.trim(),
            title: match[0].trim(),
            items,
            rawMarkdown,
            personalizationImpact: analyzeImpact(items, rawMarkdown),
        };
    }).filter((entry) => entry.version);
}

function clampLimit(limit: number | undefined): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_CHANGELOG_LIMIT;
    return Math.max(1, Math.min(MAX_CHANGELOG_LIMIT, Math.trunc(limit)));
}

function selectChangelogEntries(entries: ChangelogEntry[], query: ChangelogQuery): ChangelogEntry[] {
    if (query.version?.trim()) {
        const version = normalizeVersion(query.version);
        return entries.filter((entry) => normalizeVersion(entry.version) === version).slice(0, 1);
    }

    const limit = clampLimit(query.limit);
    if (query.fromVersion?.trim()) {
        const fromVersion = normalizeVersion(query.fromVersion);
        return entries
            .filter((entry) => compareVersions(entry.version, fromVersion) > 0)
            .slice(0, limit);
    }

    return entries.slice(0, limit);
}

export function buildChangelogResponse(query: ChangelogQuery = {}) {
    const entries = parseChangelog();
    const selectedEntries = selectChangelogEntries(entries, query);
    const impactedEntries = selectedEntries.filter((entry) => entry.personalizationImpact.mayAffectPersonalization);

    return {
        source: 'bundled CHANGELOG.md',
        resource: CHANGELOG_RESOURCE_URI,
        pluginVersion: getBundledPluginVersion(entries),
        totalEntries: entries.length,
        returnedEntries: selectedEntries.length,
        query: {
            version: query.version ? normalizeVersion(query.version) : undefined,
            fromVersion: query.fromVersion ? normalizeVersion(query.fromVersion) : undefined,
            limit: clampLimit(query.limit),
            includeRaw: query.includeRaw === true,
        },
        entries: selectedEntries.map((entry) => ({
            version: entry.version,
            date: entry.date,
            title: entry.title,
            items: entry.items,
            personalizationImpact: entry.personalizationImpact,
            ...(query.includeRaw ? { rawMarkdown: entry.rawMarkdown } : {}),
        })),
        personalizationReview: {
            shouldReview: impactedEntries.length > 0,
            affectedVersions: impactedEntries.map((entry) => entry.version),
            affectedAreas: [...new Set(impactedEntries.flatMap((entry) => entry.personalizationImpact.areas))].sort(),
            hints: [
                `Read ${CHANGELOG_RESOURCE_URI} or call system(action="changelog", fromVersion="<previousVersion>") after upgrades.`,
                'If affectedAreas includes user-rules, agent-memory, permissions, connection, appearance, timeline, or tool-config, compare the changelog with active user rules and /AGENTS.md before changing behavior.',
                'When a configured preference may be stale, remind the user what changed and ask before rewriting persistent configuration or memory.',
            ],
        },
    };
}

export function renderChangelogResource(): string {
    return [
        rawChangelog.trim(),
        '',
        '---',
        '',
        '## AI upgrade review workflow',
        '',
        '- Use `system(action="changelog", fromVersion="<previousVersion>")` to get structured entries after a known previous plugin version.',
        '- Check `personalizationReview.shouldReview` and `affectedAreas` before relying on old personalized rules, connection snippets, permissions, appearance choices, timeline settings, or `/AGENTS.md` memory.',
        '- If an update may affect existing personalization, tell the user which version changed it and ask before modifying persistent settings or memory.',
    ].join('\n');
}
