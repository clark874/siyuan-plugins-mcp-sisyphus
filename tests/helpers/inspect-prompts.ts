import { describe, it } from 'vitest';
import { buildDefaultToolConfig, type ToolCategory } from '@/core/config';
import {
    AV_TOOL_NAME,
    AV_VARIANTS,
    listAvTools,
} from '@/tools/av';
import {
    BLOCK_TOOL_NAME,
    BLOCK_VARIANTS,
    listBlockTools,
} from '@/tools/block';
import {
    DOCUMENT_TOOL_NAME,
    DOCUMENT_VARIANTS,
    listDocumentTools,
} from '@/tools/document';
import {
    FILE_TOOL_NAME,
    FILE_VARIANTS,
    listFileTools,
} from '@/tools/file';
import {
    FLASHCARD_TOOL_NAME,
    FLASHCARD_VARIANTS,
    listFlashcardTools,
} from '@/tools/flashcard';
import {
    MASCOT_TOOL_NAME,
    MASCOT_VARIANTS,
    listMascotTools,
} from '@/tools/mascot';
import {
    NOTEBOOK_TOOL_NAME,
    NOTEBOOK_VARIANTS,
    listNotebookTools,
} from '@/tools/notebook';
import {
    SEARCH_TOOL_NAME,
    SEARCH_VARIANTS,
    listSearchTools,
} from '@/tools/search';
import {
    SYSTEM_TOOL_NAME,
    SYSTEM_VARIANTS,
    listSystemTools,
} from '@/tools/system';
import {
    TAG_TOOL_NAME,
    TAG_VARIANTS,
    listTagTools,
} from '@/tools/tag';
import {
    TIMELINE_TOOL_NAME,
    TIMELINE_VARIANTS,
    listTimelineTools,
} from '@/tools/timeline';
import { tryHandleHelpAction, type ActionVariant } from '@/tools/internal/shared';
import type { CategoryToolConfig } from '@/core/config';

interface ToolEntry {
    category: ToolCategory;
    list: (config: CategoryToolConfig<string>) => { name: string; description: string; inputSchema: Record<string, unknown> }[];
    configKey: keyof ReturnType<typeof buildDefaultToolConfig>;
    variants: ActionVariant<string>[];
}

const TOOLS: ToolEntry[] = [
    { category: NOTEBOOK_TOOL_NAME, list: listNotebookTools as any, configKey: 'notebook', variants: NOTEBOOK_VARIANTS as any },
    { category: DOCUMENT_TOOL_NAME, list: listDocumentTools as any, configKey: 'document', variants: DOCUMENT_VARIANTS as any },
    { category: BLOCK_TOOL_NAME, list: listBlockTools as any, configKey: 'block', variants: BLOCK_VARIANTS as any },
    { category: AV_TOOL_NAME, list: listAvTools as any, configKey: 'av', variants: AV_VARIANTS as any },
    { category: FILE_TOOL_NAME, list: listFileTools as any, configKey: 'file', variants: FILE_VARIANTS as any },
    { category: FLASHCARD_TOOL_NAME, list: listFlashcardTools as any, configKey: 'flashcard', variants: FLASHCARD_VARIANTS as any },
    { category: MASCOT_TOOL_NAME, list: listMascotTools as any, configKey: 'mascot', variants: MASCOT_VARIANTS as any },
    { category: SEARCH_TOOL_NAME, list: listSearchTools as any, configKey: 'search', variants: SEARCH_VARIANTS as any },
    { category: SYSTEM_TOOL_NAME, list: listSystemTools as any, configKey: 'system', variants: SYSTEM_VARIANTS as any },
    { category: TAG_TOOL_NAME, list: listTagTools as any, configKey: 'tag', variants: TAG_VARIANTS as any },
    { category: TIMELINE_TOOL_NAME, list: listTimelineTools as any, configKey: 'timeline', variants: TIMELINE_VARIANTS as any },
];

function printSection(title: string, content?: string | Record<string, unknown>) {
    console.log(`\n>>> ${title}`);
    if (content === undefined) {
        return;
    }
    if (typeof content === 'string') {
        console.log(content);
    } else {
        console.log(JSON.stringify(content, null, 2));
    }
}

describe('inspect prompts', () => {
    it('prints all tool-level and property-level descriptions', () => {
        const fullConfig = buildDefaultToolConfig();

        for (const t of TOOLS) {
            const config = fullConfig[t.configKey] as CategoryToolConfig<string>;
            const tools = t.list(config);
            if (tools.length === 0) {
                console.log(`\n========== ${t.category} (disabled or no actions) ==========`);
                continue;
            }

            const [tool] = tools;
            console.log(`\n========== TOOL: ${tool.name} ==========`);

            // 1. Tool-level description
            printSection('Tool-level description', tool.description);

            // 2. Property-level descriptions
            const properties = (tool.inputSchema.properties || {}) as Record<string, { description?: string; enum?: unknown[]; type?: string }>;
            printSection('Property-level descriptions');
            for (const [key, prop] of Object.entries(properties).sort(([a], [b]) => a.localeCompare(b))) {
                const typeStr = prop.type ? ` (${prop.type})` : '';
                const enumStr = prop.enum ? ` [enum: ${prop.enum.join(', ')}]` : '';
                console.log(`  - ${key}${typeStr}${enumStr}: ${prop.description || '(no description)'}`);
            }

            // 3. Help index
            const helpIndex = tryHandleHelpAction(t.category, { action: 'help' }, config, t.variants);
            if (helpIndex) {
                printSection('Help index (action="help")', JSON.parse(helpIndex.content[0].text));
            }

            // 4. Per-action help
            const actions = (properties.action?.enum || []).filter((a): a is string => typeof a === 'string' && a !== 'help');
            for (const action of actions.sort()) {
                const actionHelp = tryHandleHelpAction(t.category, { action: 'help', topic: action }, config, t.variants);
                if (actionHelp) {
                    printSection(`Action help: ${action}`, JSON.parse(actionHelp.content[0].text));
                }
            }
        }
    });
});
