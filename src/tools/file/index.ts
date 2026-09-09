import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, FileAction } from '../../core/config';
import { FILE_ACTION_HINTS, FILE_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    FileActionSchema,
    FileIdentifyProjectSchema,
    FileListProjectSourcesSchema,
    FileReadProjectSourceSchema,
    FileRegisterProjectSourceSchema,
    FileResolveProjectSourceSchema,
    FileScanProjectManifestSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';
import { FILE_ACTION_HANDLERS, FILE_TOOL_NAME } from './handlers';

export { FILE_TOOL_NAME };

export const FILE_VARIANTS: ActionVariant<FileAction>[] = [
    createZodActionVariant('register_project_source', FileRegisterProjectSourceSchema, 'Register a portable project identity and its current-host absolute root without reading source content.'),
    createZodActionVariant('identify_project', FileIdentifyProjectSchema, 'Identify the current project from an Agent-provided absolute working directory without storing or returning local paths.'),
    createZodActionVariant('scan_project_manifest', FileScanProjectManifestSchema, 'Refresh a bounded A/B/C project file manifest using metadata and policy-limited A-tier hashes; source content is not returned.'),
    createZodActionVariant('resolve_project_source', FileResolveProjectSourceSchema, 'Resolve one registered project-relative path, verify root containment and report status without reading content.'),
    createZodActionVariant('read_project_source', FileReadProjectSourceSchema, 'Read bounded redacted UTF-8 text only from one manifest-listed path under an available registered project binding; binary and blocked files return status without content.'),
    createZodActionVariant('list_project_sources', FileListProjectSourcesSchema, 'List registered portable project identities and current-host binding status with local paths hidden by default.'),
];

const fileTool = defineTool<FileAction>({
    name: 'file',
    description: '📁 Grouped project-source operations.',
    variants: FILE_VARIANTS,
    actionSchema: FileActionSchema,
    aggregateOptions: {
        guidance: FILE_GUIDANCE,
        actionHints: FILE_ACTION_HINTS,
    },
    handlers: FILE_ACTION_HANDLERS,
});

export function listFileTools(config: CategoryToolConfig<FileAction>) {
    return fileTool.listTools(config);
}

export async function callFileTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FileAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return fileTool.callTool(client, args, config, permMgr);
}
