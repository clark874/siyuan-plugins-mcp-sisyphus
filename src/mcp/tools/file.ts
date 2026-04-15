import type { SiYuanClient } from '../../api/client';
import fs from 'fs';
import path from 'path';
import * as fileApi from '../../api/file';
import { normalizeMarkdownContent } from '../normalize';
import type { CategoryToolConfig, FileAction, FileCategoryToolConfig } from '../config';
import { FILE_ACTION_HINTS, FILE_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    FileActionSchema,
    FileDeleteAssetSchema,
    FileExportMdSchema,
    FileExportResourcesSchema,
    FileGetDocAssetsSchema,
    FileGetImageOCRTextSchema,
    FileListUnusedAssetsSchema,
    FileRemoveUnusedAssetsSchema,
    FileRenameAssetSchema,
    FileRenderSprigSchema,
    FileRenderTemplateSchema,
    FileSetImageAlphaSchema,
    FileUploadAssetSchema,
} from '../types';
import { ensurePermissionForDocumentId } from './context';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';

export const FILE_TOOL_NAME = 'file';
const DEFAULT_LARGE_UPLOAD_THRESHOLD_MB = 10;

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
        action: 'render_template',
        schema: createActionSchema('render_template', {
            id: { type: 'string', description: 'Document ID for template context' },
            path: { type: 'string', description: 'Template file path inside the SiYuan workspace (not an arbitrary local filesystem path)' },
        }, ['id', 'path'], 'Render a template with document context.'),
    },
    {
        action: 'render_sprig',
        schema: createActionSchema('render_sprig', {
            template: { type: 'string', description: 'Sprig template content' },
        }, ['template'], 'Render a Sprig template.'),
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
    {
        action: 'set_image_alpha',
        schema: createActionSchema('set_image_alpha', {
            path: { type: 'string', description: 'Asset path to update' },
            alpha: { type: 'number', description: 'Alpha value passed through to SiYuan' },
        }, ['path', 'alpha'], 'Set image alpha for an asset.'),
    },
];

export function listFileTools(config: CategoryToolConfig<FileAction>) {
    return buildAggregatedTool(
        FILE_TOOL_NAME,
        '📁 Grouped file and asset operations.',
        config,
        FILE_VARIANTS,
        {
            guidance: FILE_GUIDANCE,
            actionHints: FILE_ACTION_HINTS,
        },
    );
}

function normalizeResourcePath(input: string): string {
    const trimmed = input.trim().replace(/\\/g, '/');
    if (!trimmed) {
        return '';
    }

    const withoutLeadingSlash = trimmed.replace(/^\/+/, '');
    const workspaceRelative = withoutLeadingSlash.startsWith('data/')
        ? withoutLeadingSlash
        : withoutLeadingSlash.startsWith('assets/')
            ? `data/${withoutLeadingSlash}`
            : withoutLeadingSlash;
    const withLeadingSlash = workspaceRelative.startsWith('/') ? workspaceRelative : `/${workspaceRelative}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/');
}

function normalizeResourcePaths(paths: string[]): string[] {
    return [...new Set(paths.map(normalizeResourcePath).filter(Boolean))];
}

function resolveLocalOutputPath(outputPath: string): string {
    return path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
}

function resolveLocalInputPath(inputPath: string): string {
    return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

function isWorkspaceTemplatePathError(error: unknown): error is Error {
    return error instanceof Error && /is not in workspace/i.test(error.message);
}

type FileActionHandlerContext = {
    client: SiYuanClient;
    permMgr: PermissionManager;
    rawArgs: Record<string, unknown>;
    thresholdMB: number;
    largeUploadThresholdBytes: number;
};

type FileActionHandler = (context: FileActionHandlerContext) => Promise<ToolResult>;

const FILE_ACTION_HANDLERS: Record<FileAction, FileActionHandler> = {
    upload_asset: async ({ client, rawArgs, thresholdMB, largeUploadThresholdBytes }) => {
        const parsed = FileUploadAssetSchema.parse(rawArgs);
        const localFilePath = resolveLocalInputPath(parsed.localFilePath);
        if (!fs.existsSync(localFilePath)) {
            throw new Error(`Local file does not exist: ${localFilePath}`);
        }
        const stat = fs.statSync(localFilePath);
        if (!stat.isFile()) {
            throw new Error(`Local file path must point to a regular file: ${localFilePath}`);
        }
        if (stat.size > largeUploadThresholdBytes && parsed.confirmLargeFile !== true) {
            return createJsonResult({
                success: false,
                requiresConfirmation: true,
                reason: 'file_too_large',
                localFilePath,
                fileSizeBytes: stat.size,
                thresholdBytes: largeUploadThresholdBytes,
                thresholdMB,
                message: `File exceeds the large-upload safety threshold (${thresholdMB} MB). Stop the current operation and ask the user for explicit confirmation before retrying with confirmLargeFile=true.`,
            });
        }
        const fileName = path.basename(localFilePath);
        const fileBytes = fs.readFileSync(localFilePath);
        const result = await fileApi.uploadAsset(client, parsed.assetsDirPath, fileBytes, fileName);
        return createJsonResult({
            ...result,
            localFilePath,
            uploadedFileName: fileName,
            ...(stat.size > largeUploadThresholdBytes ? { largeFileConfirmed: true } : {}),
        });
    },
    render_template: async ({ client, permMgr, rawArgs }) => {
        const parsed = FileRenderTemplateSchema.parse(rawArgs);
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        try {
            const result = await fileApi.renderTemplate(client, parsed.id, parsed.path);
            return createJsonResult(result);
        } catch (error) {
            if (isWorkspaceTemplatePathError(error)) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: {
                                type: 'api_error',
                                tool: FILE_TOOL_NAME,
                                action: 'render_template',
                                message: error.message,
                                reason: 'path_not_in_workspace',
                                workspacePathRequired: true,
                                hint: 'The template path must point to a file inside the SiYuan workspace, not an arbitrary local path such as /tmp/... or your repo checkout.',
                            },
                        }, null, 2),
                    }],
                    isError: true,
                };
            }
            throw error;
        }
    },
    render_sprig: async ({ client, rawArgs }) => {
        const parsed = FileRenderSprigSchema.parse(rawArgs);
        const result = await fileApi.renderSprig(client, parsed.template);
        return createJsonResult(result);
    },
    export_md: async ({ client, permMgr, rawArgs }) => {
        const parsed = FileExportMdSchema.parse(rawArgs);
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        const result = normalizeMarkdownContent(await fileApi.exportMdContent(client, parsed.id));
        return createJsonResult(result);
    },
    export_resources: async ({ client, rawArgs }) => {
        const parsed = FileExportResourcesSchema.parse(rawArgs);
        const normalizedPaths = normalizeResourcePaths(parsed.paths);
        if (normalizedPaths.length === 0) {
            throw new Error('export_resources requires at least one non-empty resource path.');
        }

        let result;
        try {
            result = await fileApi.exportResources(client, normalizedPaths, parsed.name);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to export resources. original_paths=${JSON.stringify(parsed.paths)} normalized_paths=${JSON.stringify(normalizedPaths)} cause=${message}`);
        }

        if (parsed.outputPath) {
            const localOutputPath = resolveLocalOutputPath(parsed.outputPath);
            const binary = await client.readFileBinary(result.path);
            fs.mkdirSync(path.dirname(localOutputPath), { recursive: true });
            fs.writeFileSync(localOutputPath, binary);
            return createJsonResult({
                ...result,
                outputPath: localOutputPath,
                bytes: binary.byteLength,
            });
        }
        return createJsonResult(result);
    },
    list_unused_assets: async ({ client, rawArgs }) => {
        FileListUnusedAssetsSchema.parse(rawArgs);
        const result = await fileApi.getUnusedAssets(client);
        return createJsonResult({
            assets: result,
            count: Array.isArray(result) ? result.length : undefined,
        });
    },
    get_doc_assets: async ({ client, permMgr, rawArgs }) => {
        const parsed = FileGetDocAssetsSchema.parse(rawArgs);
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        const assets = parsed.assetType === 'image'
            ? await fileApi.getDocImageAssets(client, parsed.id)
            : await fileApi.getDocAssets(client, parsed.id);
        return createJsonResult({
            id: parsed.id,
            assetType: parsed.assetType ?? 'all',
            assets,
            count: Array.isArray(assets) ? assets.length : undefined,
        });
    },
    get_image_ocr_text: async ({ client, rawArgs }) => {
        const parsed = FileGetImageOCRTextSchema.parse(rawArgs);
        const result = await fileApi.getImageOCRText(client, parsed.path);
        return createJsonResult({
            path: parsed.path ?? null,
            ...result,
        });
    },
    remove_unused_assets: async ({ client, rawArgs }) => {
        FileRemoveUnusedAssetsSchema.parse(rawArgs);
        const result = await fileApi.removeUnusedAssets(client);
        return createJsonResult({
            success: true,
            ...((result && typeof result === 'object' && !Array.isArray(result)) ? result as Record<string, unknown> : { result }),
        });
    },
    rename_asset: async ({ client, rawArgs }) => {
        const parsed = FileRenameAssetSchema.parse(rawArgs);
        const result = await fileApi.renameAsset(client, parsed.oldPath, parsed.newName);
        return createJsonResult({
            success: true,
            oldPath: parsed.oldPath,
            newName: parsed.newName,
            ...result,
        });
    },
    delete_asset: async ({ client, rawArgs }) => {
        const parsed = FileDeleteAssetSchema.parse(rawArgs);
        const result = await fileApi.deleteAsset(client, parsed.path);
        return createJsonResult({
            success: true,
            path: parsed.path,
            ...((result && typeof result === 'object' && !Array.isArray(result)) ? result as Record<string, unknown> : {}),
        });
    },
    set_image_alpha: async ({ client, rawArgs }) => {
        const parsed = FileSetImageAlphaSchema.parse(rawArgs);
        const result = await fileApi.setImageAlpha(client, parsed.path, parsed.alpha);
        return createJsonResult({
            success: true,
            path: parsed.path,
            alpha: parsed.alpha,
            ...((result && typeof result === 'object' && !Array.isArray(result)) ? result as Record<string, unknown> : {}),
        });
    },
};

export async function callFileTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FileAction> | FileCategoryToolConfig<FileAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(FILE_TOOL_NAME, rawArgs, config, FILE_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const thresholdMB = 'uploadLargeFileThresholdMB' in config && typeof config.uploadLargeFileThresholdMB === 'number'
            ? config.uploadLargeFileThresholdMB
            : DEFAULT_LARGE_UPLOAD_THRESHOLD_MB;
        const largeUploadThresholdBytes = thresholdMB * 1024 * 1024;
        const parsedAction = FileActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(FILE_TOOL_NAME, parsedAction);
        }
        const handler = FILE_ACTION_HANDLERS[parsedAction];
        return await handler({ client, permMgr, rawArgs, thresholdMB, largeUploadThresholdBytes });
    } catch (error) {
        return createErrorResult(error, { tool: FILE_TOOL_NAME, action, rawArgs });
    }
}
