import type { SiYuanClient } from '../../api/client';
import * as notificationApi from '../../api/notification';
import * as systemApi from '../../api/system';
import type { SystemAction } from '../../core/config';
import {
    SystemBootProgressSchema,
    SystemChangelogSchema,
    SystemConfSchema,
    SystemGetCurrentTimeSchema,
    SystemGetVersionSchema,
    SystemNetworkSchema,
    SystemPushErrMsgSchema,
    SystemPushMsgSchema,
    SystemSysFontsSchema,
    SystemWorkspaceInfoSchema,
} from '../../core/types';
import type { ToolActionHandler } from '../define-tool';
import { createJsonResult, type ToolResult } from '../shared';

const DEFAULT_CONF_MAX_DEPTH = 1;
const DEFAULT_CONF_MAX_ITEMS = 12;
const DEFAULT_FONT_SAMPLE_LIMIT = 20;
const DEFAULT_FONT_LIST_LIMIT = 50;
const MAX_FONT_LIST_LIMIT = 200;

type SummaryNode =
    | { type: 'null'; value: null; truncated: false }
    | { type: 'primitive'; value: string | number | boolean; truncated: false }
    | {
        type: 'array';
        length: number;
        items?: SummaryNode[];
        sampleTypes?: string[];
        truncated: boolean;
        omittedItems?: number;
    }
    | {
        type: 'object';
        keyCount: number;
        entries?: Record<string, SummaryNode>;
        keysPreview?: string[];
        truncated: boolean;
        omittedKeys?: number;
    };

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(value)));
}

function parseKeyPath(keyPath: string): Array<string | number> {
    const segments = keyPath.match(/[^.[\]]+/g);
    if (!segments || segments.length === 0) {
        throw new Error('keyPath must not be empty.');
    }
    return segments.map((segment) => /^\d+$/.test(segment) ? Number(segment) : segment);
}

function getValueByPath(root: unknown, keyPath: string): unknown {
    const segments = parseKeyPath(keyPath);
    let current = root;
    for (const segment of segments) {
        if (typeof segment === 'number') {
            if (!Array.isArray(current) || segment >= current.length) {
                throw new Error(`Config path not found: ${keyPath}`);
            }
            current = current[segment];
            continue;
        }
        if (current === null || typeof current !== 'object' || !(segment in current)) {
            throw new Error(`Config path not found: ${keyPath}`);
        }
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

function summarizeValue(value: unknown, depth: number, maxDepth: number, maxItems: number): SummaryNode {
    if (value === null) return { type: 'null', value: null, truncated: false };
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return { type: 'primitive', value, truncated: false };
    }

    if (Array.isArray(value)) {
        if (depth >= maxDepth) {
            return {
                type: 'array',
                length: value.length,
                sampleTypes: value.slice(0, maxItems).map((item) => Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item),
                truncated: value.length > 0,
                omittedItems: Math.max(0, value.length - maxItems),
            };
        }
        return {
            type: 'array',
            length: value.length,
            items: value.slice(0, maxItems).map((item) => summarizeValue(item, depth + 1, maxDepth, maxItems)),
            truncated: value.length > maxItems,
            omittedItems: Math.max(0, value.length - maxItems),
        };
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (depth >= maxDepth) {
            return {
                type: 'object',
                keyCount: entries.length,
                keysPreview: entries.slice(0, maxItems).map(([key]) => key),
                truncated: entries.length > 0,
                omittedKeys: Math.max(0, entries.length - maxItems),
            };
        }
        return {
            type: 'object',
            keyCount: entries.length,
            entries: Object.fromEntries(entries.slice(0, maxItems).map(([key, entryValue]) => [
                key,
                summarizeValue(entryValue, depth + 1, maxDepth, maxItems),
            ])),
            truncated: entries.length > maxItems,
            omittedKeys: Math.max(0, entries.length - maxItems),
        };
    }

    return { type: 'primitive', value: String(value), truncated: false };
}

function buildConfResponse(raw: unknown, mode: 'summary' | 'get', keyPath: string | undefined, maxDepth: number, maxItems: number) {
    if (mode === 'get') {
        if (!keyPath) throw new Error('keyPath is required when mode="get".');
        const target = getValueByPath(raw, keyPath);
        return {
            mode,
            keyPath,
            value: summarizeValue(target, 0, maxDepth, maxItems),
            hints: [
                'Increase maxDepth or maxItems if you need a larger subtree.',
                'Use system(action="conf", mode="summary") to inspect sibling keys first.',
            ],
        };
    }

    const rootObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : { value: raw };
    const topLevelKeys = Object.keys(rootObject);
    return {
        mode,
        totalTopLevelKeys: topLevelKeys.length,
        topLevelKeys: topLevelKeys.slice(0, maxItems),
        truncatedTopLevelKeys: Math.max(0, topLevelKeys.length - maxItems),
        summary: summarizeValue(rootObject, 0, maxDepth, maxItems),
        hints: [
            'Use system(action="conf", mode="get", keyPath="<path>") to read a single field or subtree.',
            'keyPath supports dot/bracket syntax such as "conf.appearance.mode" or "conf.langs[0]".',
        ],
    };
}

function normalizeFonts(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.filter((item): item is string => typeof item === 'string');
    }
    if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).fonts)) {
        return (raw as Record<string, unknown>).fonts.filter((item): item is string => typeof item === 'string');
    }
    return [];
}

function buildFontsResponse(raw: unknown, mode: 'summary' | 'list', offset: number, limit: number, query?: string) {
    const allFonts = normalizeFonts(raw);
    const filteredFonts = query
        ? allFonts.filter((font) => font.toLowerCase().includes(query.toLowerCase()))
        : allFonts;

    if (mode === 'list') {
        const items = filteredFonts.slice(offset, offset + limit);
        return {
            mode,
            query: query ?? '',
            total: filteredFonts.length,
            offset,
            limit,
            hasMore: offset + items.length < filteredFonts.length,
            items,
        };
    }

    const sample = filteredFonts.slice(0, DEFAULT_FONT_SAMPLE_LIMIT);
    return {
        mode,
        query: query ?? '',
        total: filteredFonts.length,
        sample,
        sampleLimit: DEFAULT_FONT_SAMPLE_LIMIT,
        hasMore: filteredFonts.length > sample.length,
        next: {
            action: 'sys_fonts',
            mode: 'list',
            offset: 0,
            limit: DEFAULT_FONT_LIST_LIMIT,
            ...(query ? { query } : {}),
        },
        hints: [
            'Use system(action="sys_fonts", mode="list", offset=0, limit=50) to page through fonts.',
            'Add query to narrow results before paging when you know part of the font name.',
        ],
    };
}

const handleWorkspaceInfo: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemWorkspaceInfoSchema.parse(rawArgs);
    return createJsonResult(await systemApi.getWorkspaceInfo(client));
};

const handleNetwork: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemNetworkSchema.parse(rawArgs);
    return createJsonResult(await systemApi.getNetwork(client));
};

const handleChangelog: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemChangelogSchema.parse(rawArgs);
    return createJsonResult(await systemApi.getChangelog(client));
};

const handleConf: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemConfSchema.parse(rawArgs);
    const rawConf = await systemApi.getConf(client);
    const mode = parsed.mode ?? 'summary';
    const maxDepth = clampInteger(parsed.maxDepth, DEFAULT_CONF_MAX_DEPTH, 0, 5);
    const maxItems = clampInteger(parsed.maxItems, DEFAULT_CONF_MAX_ITEMS, 1, 100);
    return createJsonResult(buildConfResponse(rawConf, mode, parsed.keyPath, maxDepth, maxItems));
};

const handleSysFonts: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemSysFontsSchema.parse(rawArgs);
    const rawFonts = await systemApi.getSysFonts(client);
    const mode = parsed.mode ?? 'summary';
    const offset = clampInteger(parsed.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = clampInteger(parsed.limit, DEFAULT_FONT_LIST_LIMIT, 1, MAX_FONT_LIST_LIMIT);
    return createJsonResult(buildFontsResponse(rawFonts, mode, offset, limit, parsed.query));
};

const handleBootProgress: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemBootProgressSchema.parse(rawArgs);
    return createJsonResult(await systemApi.getBootProgress(client));
};

const handlePushMsg: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemPushMsgSchema.parse(rawArgs);
    return createJsonResult(await notificationApi.pushMsg(client, parsed.msg, parsed.timeout));
};

const handlePushErrMsg: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemPushErrMsgSchema.parse(rawArgs);
    return createJsonResult(await notificationApi.pushErrMsg(client, parsed.msg, parsed.timeout));
};

const handleGetVersion: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemGetVersionSchema.parse(rawArgs);
    return createJsonResult({ version: await systemApi.getVersion(client) });
};

const handleGetCurrentTime: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemGetCurrentTimeSchema.parse(rawArgs);
    const currentTime = await systemApi.getCurrentTime(client);
    return createJsonResult({ currentTime, iso: new Date(currentTime).toISOString() });
};

export const SYSTEM_ACTION_HANDLERS: Record<SystemAction, ToolActionHandler> = {
    workspace_info: handleWorkspaceInfo,
    network: handleNetwork,
    changelog: handleChangelog,
    conf: handleConf,
    sys_fonts: handleSysFonts,
    boot_progress: handleBootProgress,
    push_msg: handlePushMsg,
    push_err_msg: handlePushErrMsg,
    get_version: handleGetVersion,
    get_current_time: handleGetCurrentTime,
};
