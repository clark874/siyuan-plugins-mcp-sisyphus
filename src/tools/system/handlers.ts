import type { SiYuanClient } from '../../api/client';
import * as notificationApi from '../../api/notification';
import * as packagesApi from '../../api/packages';
import * as systemApi from '../../api/system';
import { buildChangelogResponse } from '../../core/changelog';
import type { SystemAction } from '../../core/config';
import {
    SystemChangelogSchema,
    SystemConfSchema,
    SystemAuditEnvironmentSchema,
    SystemGetCurrentTimeSchema,
    SystemGetVersionSchema,
    SystemNetworkSchema,
    SystemNotifySchema,
    SystemListPackagesSchema,
    SystemPerformSyncSchema,
    SystemWorkspaceInfoSchema,
} from '../../core/types';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult, type ToolResult } from '../internal/shared';

const DEFAULT_CONF_MAX_DEPTH = 1;
const DEFAULT_CONF_MAX_ITEMS = 12;
const DEFAULT_PACKAGE_PAGE_SIZE = 50;
const PACKAGE_DESCRIPTION_MAX_LENGTH = 300;

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

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const items = value.filter((item): item is string => typeof item === 'string');
    return items.length > 0 ? items : undefined;
}

function truncateText(value: unknown, maxLength: number): string | undefined {
    const text = readString(value);
    if (!text) return undefined;
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

function normalizeInstalledPackage(pkg: Record<string, unknown>, kind: packagesApi.InstalledPackageKind) {
    const name = readString(pkg.name) ?? 'unknown';
    const incompatible = typeof pkg.installedIncompatible === 'boolean'
        ? pkg.installedIncompatible
        : undefined;
    return {
        name,
        displayName: readString(pkg.preferredName) ?? name,
        description: truncateText(pkg.preferredDesc, PACKAGE_DESCRIPTION_MAX_LENGTH),
        version: readString(pkg.version),
        author: readString(pkg.author),
        repository: readString(pkg.repoURL) ?? readString(pkg.url),
        minAppVersion: readString(pkg.minAppVersion),
        enabled: kind === 'plugin' ? pkg.enabled === true : undefined,
        compatible: incompatible === undefined ? undefined : !incompatible,
        outdated: typeof pkg.outdated === 'boolean' ? pkg.outdated : undefined,
        current: typeof pkg.current === 'boolean' ? pkg.current : undefined,
        installedAt: readString(pkg.hInstallDate),
        frontends: readStringArray(pkg.frontends),
        backends: readStringArray(pkg.backends),
        keywords: readStringArray(pkg.keywords),
    };
}

function countPluginStates(plugins: Record<string, unknown>[]) {
    return {
        enabled: plugins.filter((pkg) => pkg.enabled === true).length,
        disabled: plugins.filter((pkg) => pkg.enabled !== true).length,
        incompatible: plugins.filter((pkg) => pkg.installedIncompatible === true).length,
        outdated: plugins.filter((pkg) => pkg.outdated === true).length,
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

const handleConf: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemConfSchema.parse(rawArgs);
    const rawConf = await systemApi.getConf(client);
    const mode = parsed.mode ?? 'summary';
    const maxDepth = clampInteger(parsed.maxDepth, DEFAULT_CONF_MAX_DEPTH, 0, 5);
    const maxItems = clampInteger(parsed.maxItems, DEFAULT_CONF_MAX_ITEMS, 1, 100);
    return createJsonResult(buildConfResponse(rawConf, mode, parsed.keyPath, maxDepth, maxItems));
};

const handleNotify: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemNotifySchema.parse(rawArgs);
    const result = parsed.level === 'error'
        ? await notificationApi.pushErrMsg(client, parsed.msg, parsed.timeout)
        : await notificationApi.pushMsg(client, parsed.msg, parsed.timeout);
    return createJsonResult({ level: parsed.level, ...result });
};

const handleChangelog: ToolActionHandler = async ({ rawArgs }) => {
    const parsed = SystemChangelogSchema.parse(rawArgs);
    return createJsonResult(buildChangelogResponse(parsed));
};

const handlePerformSync: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemPerformSyncSchema.parse(rawArgs);
    return createJsonResult({
        ok: true,
        result: await systemApi.performSync(client),
    });
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

const handleAuditEnvironment: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemAuditEnvironmentSchema.parse(rawArgs);
    const frontend = parsed.frontend ?? 'desktop';
    const [version, rawConf, packageLists] = await Promise.all([
        systemApi.getVersion(client),
        systemApi.getConf(client),
        Promise.all(packagesApi.INSTALLED_PACKAGE_KINDS.map((kind) => (
            packagesApi.getInstalledPackages(client, kind, '', frontend)
        ))),
    ]);
    const packagesByKind = Object.fromEntries(packagesApi.INSTALLED_PACKAGE_KINDS.map((kind, index) => [
        kind,
        packageLists[index],
    ])) as Record<packagesApi.InstalledPackageKind, Record<string, unknown>[]>;

    return createJsonResult({
        readonly: true,
        version,
        frontend,
        configuration: buildConfResponse(rawConf, 'summary', undefined, 0, 20),
        packages: {
            totals: Object.fromEntries(packagesApi.INSTALLED_PACKAGE_KINDS.map((kind) => [
                kind,
                packagesByKind[kind].length,
            ])),
            plugins: countPluginStates(packagesByKind.plugin),
        },
        hints: [
            'Use system(action="conf", mode="get", keyPath="<path>") to inspect one masked configuration subtree.',
            'Use system(action="list_packages", kind="plugin"|"widget"|"theme"|"icon"|"template") for package details.',
            'This audit never reads third-party plugin storage and never changes package state.',
        ],
    });
};

const handleListPackages: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemListPackagesSchema.parse(rawArgs);
    const frontend = parsed.frontend ?? 'desktop';
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? DEFAULT_PACKAGE_PAGE_SIZE;
    const packages = await packagesApi.getInstalledPackages(client, parsed.kind, parsed.keyword?.trim() ?? '', frontend);
    const start = (page - 1) * pageSize;

    return createJsonResult({
        readonly: true,
        kind: parsed.kind,
        frontend,
        keyword: parsed.keyword?.trim() ?? '',
        total: packages.length,
        page,
        pageSize,
        pageCount: packages.length === 0 ? 0 : Math.ceil(packages.length / pageSize),
        items: packages.slice(start, start + pageSize).map((pkg) => normalizeInstalledPackage(pkg, parsed.kind)),
        hints: [
            'Results contain compact package metadata only; README and plugin configuration content are excluded.',
            'Use keyword to narrow the installed-package list when searching for one extension.',
        ],
    });
};

export const SYSTEM_ACTION_HANDLERS: Record<SystemAction, ToolActionHandler> = {
    workspace_info: handleWorkspaceInfo,
    network: handleNetwork,
    conf: handleConf,
    notify: handleNotify,
    changelog: handleChangelog,
    perform_sync: handlePerformSync,
    get_version: handleGetVersion,
    get_current_time: handleGetCurrentTime,
    audit_environment: handleAuditEnvironment,
    list_packages: handleListPackages,
};
