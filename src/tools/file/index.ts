import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, FileAction, FileCategoryToolConfig } from '../../core/config';
import { FILE_ACTION_HINTS, FILE_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import { FileActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant, type ToolResult } from '../shared';
import { createFileActionHandlers, FILE_TOOL_NAME, DEFAULT_LARGE_UPLOAD_THRESHOLD_MB } from './handlers';

export { FILE_TOOL_NAME };

export const FILE_VARIANTS: ActionVariant<FileAction>[] = [
    {
        action: 'upload_asset',
        schema: createActionSchema('upload_asset', {
            assetsDirPath: { type: 'string', description: 'Asset directory path (e.g., /assets/)' },
            localFilePath: { type: 'string', description: 'Local file path to read and upload into the assets directory' },
            confirmLargeFile: { type: 'boolean', description: 'Set to true only after the user explicitly confirms uploading a file larger than the configured safety threshold.' },
        }, ['assetsDirPath', 'localFilePath'], 'Read a local file and upload it to the specified assets directory.'),
    },
    {
        action: 'render',
        schema: createActionSchema('render', {
            engine: { type: 'string', enum: ['template', 'sprig'], description: 'Template engine to use' },
            id: { type: 'string', description: 'Document ID for the limited template context when engine=template' },
            path: { type: 'string', description: 'Workspace template file path when engine=template; use .action{.title}, not {{.title}}' },
            template: { type: 'string', description: 'Inline Sprig template content when engine=sprig; uses {{...}} syntax without document context' },
        }, ['engine'], 'Render a SiYuan workspace template (.action{.title}) or an inline Sprig template ({{...}}).'),
    },
    {
        action: 'export_md',
        schema: createActionSchema('export_md', {
            id: { type: 'string', description: 'Document ID to export' },
        }, ['id'], 'Export document content as Markdown.'),
    },
    {
        action: 'export_resources',
        schema: createActionSchema('export_resources', {
            paths: { type: 'array', items: { type: 'string' }, description: 'Paths to export' },
            name: { type: 'string', description: 'Export file name' },
            outputPath: { type: 'string', description: 'Optional local absolute or relative filesystem path to save the exported ZIP' },
        }, ['paths'], 'Export resources as a ZIP archive.'),
    },
    {
        action: 'list_unused_assets',
        schema: createActionSchema('list_unused_assets', {}, [], 'List unused asset files.'),
    },
    {
        action: 'get_doc_assets',
        schema: createActionSchema('get_doc_assets', {
            id: { type: 'string', description: 'Document ID' },
            assetType: { type: 'string', enum: ['all', 'image'], description: "Filter: 'all' (default) returns all assets, 'image' returns only image assets." },
        }, ['id'], 'List assets referenced by a document. Use assetType to filter.'),
    },
    {
        action: 'get_image_ocr_text',
        schema: createActionSchema('get_image_ocr_text', {
            path: { type: 'string', description: 'Optional asset path; omit to receive an empty OCR text payload' },
        }, [], 'Get stored OCR text for an image asset.'),
    },
    {
        action: 'remove_unused_assets',
        schema: createActionSchema('remove_unused_assets', {}, [], 'Remove all unused asset files.'),
    },
    {
        action: 'rename_asset',
        schema: createActionSchema('rename_asset', {
            oldPath: { type: 'string', description: 'Existing asset path' },
            newName: { type: 'string', description: 'New asset file name' },
        }, ['oldPath', 'newName'], 'Rename an asset file.'),
    },
    {
        action: 'delete_asset',
        schema: createActionSchema('delete_asset', {
            path: { type: 'string', description: 'Asset path to delete' },
        }, ['path'], 'Delete an asset file.'),
    },
];

function createFileTool(thresholdMB: number, largeUploadThresholdBytes: number) {
    return defineTool<FileAction>({
        name: 'file',
        description: '📁 Grouped file and asset operations.',
        variants: FILE_VARIANTS,
        actionSchema: FileActionSchema,
        aggregateOptions: {
            guidance: FILE_GUIDANCE,
            actionHints: FILE_ACTION_HINTS,
        },
        handlers: createFileActionHandlers(thresholdMB, largeUploadThresholdBytes),
    });
}

const listFileTool = createFileTool(DEFAULT_LARGE_UPLOAD_THRESHOLD_MB, DEFAULT_LARGE_UPLOAD_THRESHOLD_MB * 1024 * 1024);

export function listFileTools(config: CategoryToolConfig<FileAction>) {
    return listFileTool.listTools(config);
}

export async function callFileTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FileAction> | FileCategoryToolConfig<FileAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const thresholdMB = 'uploadLargeFileThresholdMB' in config && typeof config.uploadLargeFileThresholdMB === 'number'
        ? config.uploadLargeFileThresholdMB
        : DEFAULT_LARGE_UPLOAD_THRESHOLD_MB;
    const largeUploadThresholdBytes = thresholdMB * 1024 * 1024;
    return createFileTool(thresholdMB, largeUploadThresholdBytes).callTool(client, args, config, permMgr);
}
