import { hasSensitiveKey } from './security';

export interface PluginAdapter {
    storageRoot?: string;
    configFiles: string[];
    fieldHints?: Record<string, string>;
}

export const PLUGIN_ADAPTERS: Record<string, PluginAdapter> = {
    'Calendar-heatmap': { configFiles: ['config.json'] },
    'graph-enhance': { configFiles: ['graph-enhance-config', 'graph-enhance-graph-state'] },
    'siyuan-plugins-index': { configFiles: ['config'], fieldHints: { autoUpdate: '自动更新目录' } },
    'syplugin-document-search': { configFiles: ['search-setting.json'] },
    'syplugin-hierarchyNavigate': { configFiles: ['settings_main.json'] },
    'siyuan-plugin-citation': { configFiles: ['menu-config', 'references'] },
    'siyuan-plugin-sidebar-memo': { configFiles: ['menu-config'] },
    'kmind-plugin': { storageRoot: 'kmind', configFiles: [] },
    'knote-plugin': { storageRoot: 'knote', configFiles: [] },
};

export function getPluginStorageRoot(pluginName: string): string {
    return PLUGIN_ADAPTERS[pluginName]?.storageRoot ?? pluginName;
}

type FieldCategory = 'featureSwitches' | 'scopeAndPaths' | 'scheduleAndTime' | 'appearance' | 'integrations' | 'advanced' | 'unknown';

const CATEGORY_PATTERNS: Array<[FieldCategory, RegExp]> = [
    ['featureSwitches', /(?:enable|enabled|disable|active|auto|show|hide|open|close|switch|toggle)/i],
    ['scopeAndPaths', /(?:path|dir|folder|root|scope|include|exclude|notebook|document|block)/i],
    ['scheduleAndTime', /(?:time|date|day|week|month|interval|delay|timeout|schedule|cron)/i],
    ['appearance', /(?:color|theme|style|font|icon|width|height|size|position|layout)/i],
    ['integrations', /(?:api|url|host|port|server|integration|provider|service|endpoint)/i],
    ['advanced', /(?:debug|cache|limit|max|min|threshold|mode|strategy|experimental)/i],
];

export interface InterpretedField {
    path: string;
    category: FieldCategory;
    valueType: string;
    value: unknown;
    meaning?: string;
    confidence: 'declared' | 'inferred' | 'unknown';
}

export function interpretPluginConfig(pluginName: string, value: unknown): InterpretedField[] {
    const hints = PLUGIN_ADAPTERS[pluginName]?.fieldHints ?? {};
    const fields: InterpretedField[] = [];
    const walk = (current: unknown, path: string[]): void => {
        if (Array.isArray(current)) {
            fields.push({
                path: path.join('.'),
                category: 'advanced',
                valueType: 'array',
                value: current,
                confidence: 'inferred',
            });
            return;
        }
        if (current !== null && typeof current === 'object') {
            for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
                if (!hasSensitiveKey(key)) walk(child, [...path, key]);
            }
            return;
        }
        const key = path.at(-1) ?? '';
        const fullPath = path.join('.');
        const hint = hints[fullPath] ?? hints[key];
        const matched = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(key));
        fields.push({
            path: fullPath,
            category: matched?.[0] ?? (hint ? 'advanced' : 'unknown'),
            valueType: current === null ? 'null' : typeof current,
            value: current,
            meaning: hint,
            confidence: hint ? 'declared' : matched ? 'inferred' : 'unknown',
        });
    };
    walk(value, []);
    return fields;
}
