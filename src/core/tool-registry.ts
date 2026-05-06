import type { SiYuanClient } from '../api/client';
import { TOOL_CATEGORIES, type ToolCategory, type ToolConfig } from './config';
import type { PermissionManager } from './permissions';
import type { ToolResult } from '@/tools/internal/shared';

import {
    callAvTool,
    callBlockTool,
    callDocumentTool,
    callFileTool,
    callFlashcardTool,
    callMascotTool,
    callNotebookTool,
    callSearchTool,
    callSystemTool,
    callTagTool,
    listAvTools,
    listBlockTools,
    listDocumentTools,
    listFileTools,
    listFlashcardTools,
    listMascotTools,
    listNotebookTools,
    listSearchTools,
    listSystemTools,
    listTagTools,
} from '@/tools/index';


/**
 * Minimal tool descriptor as consumed by the MCP ListTools response.
 * The per-category list helpers emit these objects directly.
 */
export interface ToolDescriptor {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

/**
 * A single registry entry. Each tool module is erased to the generic config
 * type so iteration across categories works without conditional types.
 * The per-category functions still carry their own precise signatures — this
 * interface only describes what the registry consumer needs.
 */
export interface ToolModule {
    category: ToolCategory;
    listTools(config: ToolConfig[ToolCategory]): ToolDescriptor[];
    callTool(
        client: SiYuanClient,
        args: Record<string, unknown> | undefined,
        config: ToolConfig[ToolCategory],
        permMgr: PermissionManager,
    ): Promise<ToolResult>;
}

// The cast at each entry is a controlled widening from the precise per-category
// config type to the erased union. It is safe because we look up by category
// at runtime and always pass the matching config slice back in.
export const TOOL_REGISTRY: Record<ToolCategory, ToolModule> = {
    notebook: { category: 'notebook', listTools: listNotebookTools as ToolModule['listTools'], callTool: callNotebookTool as ToolModule['callTool'] },
    document: { category: 'document', listTools: listDocumentTools as ToolModule['listTools'], callTool: callDocumentTool as ToolModule['callTool'] },
    block: { category: 'block', listTools: listBlockTools as ToolModule['listTools'], callTool: callBlockTool as ToolModule['callTool'] },
    av: { category: 'av', listTools: listAvTools as ToolModule['listTools'], callTool: callAvTool as ToolModule['callTool'] },
    file: { category: 'file', listTools: listFileTools as ToolModule['listTools'], callTool: callFileTool as ToolModule['callTool'] },
    search: { category: 'search', listTools: listSearchTools as ToolModule['listTools'], callTool: callSearchTool as ToolModule['callTool'] },
    tag: { category: 'tag', listTools: listTagTools as ToolModule['listTools'], callTool: callTagTool as ToolModule['callTool'] },
    system: { category: 'system', listTools: listSystemTools as ToolModule['listTools'], callTool: callSystemTool as ToolModule['callTool'] },
    flashcard: { category: 'flashcard', listTools: listFlashcardTools as ToolModule['listTools'], callTool: callFlashcardTool as ToolModule['callTool'] },
    mascot: { category: 'mascot', listTools: listMascotTools as ToolModule['listTools'], callTool: callMascotTool as ToolModule['callTool'] },
};

export const USER_RULES_TOOL_DESCRIPTION_REMINDER = 'Active user custom rules apply. Check the server instructions or siyuan://help/user-rules before choosing actions.';

export function resolveCategory(name: string): ToolCategory | null {
    return TOOL_CATEGORIES.includes(name as ToolCategory) ? (name as ToolCategory) : null;
}

export function listAllTools(config: ToolConfig): ToolDescriptor[] {
    const tools = TOOL_CATEGORIES.flatMap((cat) => TOOL_REGISTRY[cat].listTools(config[cat]));
    if (!config.userRulesText.trim()) {
        return tools;
    }

    return tools.map((tool) => ({
        ...tool,
        description: tool.description
            ? `${tool.description}\n\n${USER_RULES_TOOL_DESCRIPTION_REMINDER}`
            : USER_RULES_TOOL_DESCRIPTION_REMINDER,
    }));
}
