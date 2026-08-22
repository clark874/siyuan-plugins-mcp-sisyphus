import fs from 'node:fs';
import path from 'node:path';
import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import * as fileApi from '../../api/file';
import * as templateApi from '../../api/template';
import { normalizeMarkdownContent } from '../../core/normalize';
import type { FileAction } from '../../core/config';
import type { PermissionManager } from '../../core/permissions';
import {
    FileCreateTemplateSchema,
    FileDeleteTemplateSchema,
    FileDeleteAssetSchema,
    FileExportMdSchema,
    FileExportResourcesSchema,
    FileExtractDocSchema,
    FileGetDocAssetsSchema,
    FileGetImageOCRTextSchema,
    FileInsertAssetsSchema,
    FileListTemplatesSchema,
    FileListUnusedAssetsSchema,
    FileReadTemplateSchema,
    FileRemoveUnusedAssetsSchema,
    FileRenameAssetSchema,
    FileRenderSchema,
    FileSaveDocAsTemplateSchema,
    FileUpdateTemplateSchema,
    FileUploadAssetSchema,
} from '../../core/types';
import { ensurePermissionForDocumentId } from '../internal/context';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult, createPaginatedResult, paginate, type ToolResult } from '../internal/shared';
import { applyUiRefresh } from '../internal/ui-refresh';
import { preflightLocalAssets, renderInsertedAssetMarkdown } from './asset-ingestion';

export const FILE_TOOL_NAME = 'file';
export const DEFAULT_LARGE_UPLOAD_THRESHOLD_MB = 10;

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

function templateErrorResult(
    action: 'render' | 'read_template' | 'create_template' | 'update_template' | 'delete_template' | 'save_doc_as_template',
    error: unknown,
    reason: string,
    hint: string,
    extra?: Record<string, unknown>,
): ToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                error: {
                    type: 'api_error',
                    tool: FILE_TOOL_NAME,
                    action,
                    message,
                    reason,
                    ...(extra ?? {}),
                    hint,
                },
            }, null, 2),
        }],
        isError: true,
    };
}

function getTemplateErrorReason(error: unknown): string {
    if (error && typeof error === 'object' && 'reason' in error && typeof (error as { reason?: unknown }).reason === 'string') {
        return (error as { reason: string }).reason;
    }
    return 'template_source_unavailable';
}

function isTemplateNotFoundError(error: unknown): boolean {
    return getTemplateErrorReason(error) === 'template_not_found';
}

function getTemplateName(relativePath: string): string {
    return path.basename(relativePath).replace(/\.md$/i, '');
}

function buildTemplateListItem(item: { path: string; content: string }) {
    const normalized = templateApi.normalizeTemplatePath(item.path);
    return {
        path: item.path,
        relativePath: normalized.relativePath,
        name: getTemplateName(normalized.relativePath),
        content: item.content,
        readArgs: {
            action: 'read_template',
            path: item.path,
        },
        renderArgsTemplate: {
            action: 'render',
            engine: 'template',
            id: '<doc-id>',
            path: item.path,
        },
    };
}

function buildTemplateMutationPayload(pathValue: string, relativePath: string, totalChars?: number) {
    return {
        path: pathValue,
        relativePath,
        name: getTemplateName(relativePath),
        ...(typeof totalChars === 'number' ? { totalChars } : {}),
        readArgs: {
            action: 'read_template',
            path: pathValue,
        },
        renderArgsTemplate: {
            action: 'render',
            engine: 'template',
            id: '<doc-id>',
            path: pathValue,
        },
    };
}

async function resolveTemplateAfterWrite(
    client: SiYuanClient,
    relativePath: string,
    fallbackPath: string,
    totalChars: number,
) {
    try {
        const resolved = await templateApi.resolveTemplate(client, relativePath);
        return buildTemplateMutationPayload(resolved.path, resolved.relativePath, totalChars);
    } catch {
        return buildTemplateMutationPayload(fallbackPath, relativePath, totalChars);
    }
}

const handleUploadAsset = (thresholdMB: number, largeUploadThresholdBytes: number): ToolActionHandler =>
    async ({ client, rawArgs }) => {
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
    };

function createPendingVerificationResult(details: Record<string, unknown>): ToolResult {
    const payload = {
        success: false,
        transactionState: 'pending_verification',
        writeAttempted: true,
        writeExecuted: true,
        retryAllowed: false,
        pendingVerification: details,
    };
    return {
        ...createJsonResult(payload),
        structuredContent: payload,
        isError: true,
    };
}

const handleInsertAssets = (largeUploadThresholdBytes: number): ToolActionHandler =>
    async ({ client, permMgr, rawArgs }) => {
        const parsed = FileInsertAssetsSchema.parse(rawArgs);
        const document = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'write');
        if (document.denied) return document.denied;
        const anchor = await ensurePermissionForDocumentId(client, permMgr, parsed.anchorId, 'write');
        if (anchor.denied) return anchor.denied;
        if (anchor.context.documentId !== document.context.documentId) {
            throw new Error(`anchorId "${parsed.anchorId}" does not belong to documentId "${parsed.documentId}".`);
        }
        const preflight = await preflightLocalAssets(parsed.assets, largeUploadThresholdBytes);
        if (preflight.largeFiles.length > 0 && parsed.confirmLargeFiles !== true) {
            return createJsonResult({
                success: false,
                requiresConfirmation: true,
                writeAttempted: false,
                writeExecuted: false,
                reason: 'file_too_large',
                largeFiles: preflight.largeFiles,
                thresholdBytes: largeUploadThresholdBytes,
                message: 'Stop and obtain explicit approval before retrying with confirmLargeFiles=true.',
            });
        }
        const uploaded = await fileApi.insertLocalAssets(
            client,
            parsed.documentId,
            preflight.items.map((item) => item.localPath),
        );
        const resolved = preflight.items.map((item) => ({
            item,
            resolvedPath: uploaded.succMap[item.localPath] ?? uploaded.succMap[item.basename],
        }));
        const unresolved = resolved.filter((item) => !item.resolvedPath).map((item) => item.item.localPath);
        if (unresolved.length > 0) {
            return createPendingVerificationResult({
                reason: 'asset_resolution_incomplete',
                documentId: parsed.documentId,
                anchorId: parsed.anchorId,
                unresolved,
                succMap: uploaded.succMap,
            });
        }
        const markdown = resolved
            .map(({ item, resolvedPath }) => renderInsertedAssetMarkdown(item, resolvedPath!))
            .join('\n');
        const insertion = await blockApi.insertBlock(client, 'markdown', markdown, undefined, parsed.anchorId);
        const insertedBlockId = extractInsertedBlockId(insertion);
        if (!insertedBlockId) {
            return createPendingVerificationResult({
                reason: 'inserted_block_id_missing',
                documentId: parsed.documentId,
                anchorId: parsed.anchorId,
                resolvedPaths: resolved.map((item) => item.resolvedPath),
            });
        }
        const readback = await blockApi.getBlockKramdown(client, insertedBlockId);
        const kramdown = typeof readback?.kramdown === 'string' ? readback.kramdown : '';
        const missingPaths = resolved
            .map((item) => item.resolvedPath!)
            .filter((resolvedPath) => !kramdown.includes(resolvedPath));
        if (missingPaths.length > 0) {
            return createPendingVerificationResult({
                reason: 'asset_link_readback_mismatch',
                documentId: parsed.documentId,
                insertedBlockId,
                missingPaths,
            });
        }
        return applyUiRefresh(client, createJsonResult({
            success: true,
            action: 'insert_assets',
            documentId: parsed.documentId,
            anchorId: parsed.anchorId,
            insertedBlockId,
            items: resolved.map(({ item, resolvedPath }) => ({
                localPath: item.localPath,
                kind: item.kind,
                resolvedPath,
                verified: true,
            })),
            verification: { status: 'verified', method: 'block-kramdown-readback' },
        }), [{ type: 'reloadProtyle', id: parsed.documentId }]);
    };

function extractInsertedBlockId(value: unknown): string | undefined {
    const batches = Array.isArray(value) ? value : [value];
    for (const batch of batches) {
        if (!batch || typeof batch !== 'object') continue;
        const operations = (batch as { doOperations?: unknown }).doOperations;
        if (!Array.isArray(operations)) continue;
        for (const operation of operations) {
            const id = operation && typeof operation === 'object' ? (operation as { id?: unknown }).id : undefined;
            if (typeof id === 'string' && id) return id;
        }
    }
    return undefined;
}

const handleRender: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FileRenderSchema.parse(rawArgs);
    if (parsed.engine === 'sprig') {
        const result = await templateApi.renderSprig(client, parsed.template!);
        return createJsonResult(result);
    }
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id!, 'read');
    if (denied) return denied;
    try {
        const result = await templateApi.renderTemplate(client, parsed.id!, parsed.path!, parsed.preview);
        return createJsonResult(result);
    } catch (error) {
        if (isWorkspaceTemplatePathError(error)) {
            return templateErrorResult(
                'render',
                error,
                'path_not_in_workspace',
                'The template path must point to a file inside the SiYuan workspace, not an arbitrary local path such as /tmp/... or your repo checkout. Use file(action="list_templates") to resolve a valid template path.',
                { workspacePathRequired: true },
            );
        }
        throw error;
    }
};

const handleListTemplates: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileListTemplatesSchema.parse(rawArgs);
    const query = parsed.query ?? '';
    const result = await templateApi.searchTemplates(client, query);
    const templates = (Array.isArray(result.templates) ? result.templates : []).map(buildTemplateListItem);
    const paged = paginate(templates, parsed.page ?? 1, parsed.pageSize ?? 20);
    return createPaginatedResult(paged.items, paged, {
        query: result.k,
        showing: paged.showing,
        truncated: paged.truncated,
    });
};

const handleReadTemplate: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileReadTemplateSchema.parse(rawArgs);
    try {
        const source = await templateApi.readTemplateSource(client, parsed.path);
        const totalChars = source.markdown.length;
        const offset = parsed.offset ?? 0;
        const limit = parsed.limit ?? 8000;
        const markdown = source.markdown.slice(offset, offset + limit);
        const nextOffset = offset + markdown.length;
        const truncated = nextOffset < totalChars;
        return createJsonResult({
            path: source.path,
            relativePath: source.relativePath,
            markdown,
            totalChars,
            offset,
            limit,
            truncated,
            ...(truncated ? { nextOffset } : {}),
        });
    } catch (error) {
        return templateErrorResult(
            'read_template',
            error,
            getTemplateErrorReason(error),
            'Use file(action="list_templates") to resolve a valid Markdown template path. If you only need rendered output, use file(action="render", engine="template").',
        );
    }
};

const handleCreateTemplate: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileCreateTemplateSchema.parse(rawArgs);
    if (parsed.overwrite !== true) {
        try {
            const existing = await templateApi.resolveTemplate(client, parsed.path);
            return templateErrorResult(
                'create_template',
                new Error(`Template already exists: ${existing.relativePath}`),
                'template_exists',
                'Pass overwrite=true to replace the existing template, or choose a different template path.',
                {
                    path: existing.path,
                    relativePath: existing.relativePath,
                },
            );
        } catch (error) {
            if (!isTemplateNotFoundError(error)) {
                return templateErrorResult(
                    'create_template',
                    error,
                    getTemplateErrorReason(error),
                    'Use a Markdown template path under data/templates, such as "reports/monthly.md".',
                );
            }
        }
    }

    try {
        const written = await templateApi.writeTemplateSource(client, parsed.path, parsed.markdown);
        const payload = await resolveTemplateAfterWrite(client, written.relativePath, written.path, written.totalChars);
        return createJsonResult({
            success: true,
            ...payload,
        });
    } catch (error) {
        return templateErrorResult(
            'create_template',
            error,
            getTemplateErrorReason(error),
            'Use a Markdown template path under data/templates, such as "reports/monthly.md".',
        );
    }
};

const handleUpdateTemplate: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileUpdateTemplateSchema.parse(rawArgs);
    let existing: templateApi.TemplateSearchItem;
    try {
        existing = await templateApi.resolveTemplate(client, parsed.path);
    } catch (error) {
        return templateErrorResult(
            'update_template',
            error,
            getTemplateErrorReason(error),
            'Use file(action="list_templates") to resolve an existing Markdown template before updating it.',
        );
    }

    try {
        const written = await templateApi.writeTemplateSource(client, existing.relativePath, parsed.markdown);
        const payload = await resolveTemplateAfterWrite(client, written.relativePath, existing.path, written.totalChars);
        return createJsonResult({
            success: true,
            ...payload,
        });
    } catch (error) {
        return templateErrorResult(
            'update_template',
            error,
            getTemplateErrorReason(error),
            'The template was found, but writing the replacement Markdown failed.',
        );
    }
};

const handleDeleteTemplate: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileDeleteTemplateSchema.parse(rawArgs);
    try {
        const result = await templateApi.deleteTemplate(client, parsed.path);
        return createJsonResult({
            success: true,
            ...result,
        });
    } catch (error) {
        return templateErrorResult(
            'delete_template',
            error,
            getTemplateErrorReason(error),
            'Use file(action="list_templates") to resolve an existing Markdown template before deleting it.',
        );
    }
};

const handleSaveDocAsTemplate: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FileSaveDocAsTemplateSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;

    try {
        const saved = await templateApi.saveDocAsTemplate(client, parsed.id, parsed.name, parsed.overwrite ?? false);
        let template;
        try {
            const resolved = await templateApi.resolveTemplate(client, saved.relativePath);
            template = buildTemplateMutationPayload(resolved.path, resolved.relativePath);
        } catch {
            template = undefined;
        }
        return createJsonResult({
            success: true,
            id: saved.id,
            name: saved.name,
            ...(template ? { template } : {}),
        });
    } catch (error) {
        return templateErrorResult(
            'save_doc_as_template',
            error,
            getTemplateErrorReason(error),
            'Use a root-level template name without slashes. Pass overwrite=true to replace an existing template.',
        );
    }
};

const handleExportMd: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = FileExportMdSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = normalizeMarkdownContent(await fileApi.exportMdContent(client, parsed.id));
    return createJsonResult(result);
};

const handleExportResources: ToolActionHandler = async ({ client, rawArgs }) => {
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
};

const handleListUnusedAssets: ToolActionHandler = async ({ client, rawArgs }) => {
    FileListUnusedAssetsSchema.parse(rawArgs);
    const result = await fileApi.getUnusedAssets(client);
    return createJsonResult({
        assets: result,
        count: Array.isArray(result) ? result.length : undefined,
    });
};

const handleGetDocAssets: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
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
};

const handleGetImageOCRText: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileGetImageOCRTextSchema.parse(rawArgs);
    const result = await fileApi.getImageOCRText(client, parsed.path);
    return createJsonResult({
        path: parsed.path ?? null,
        ...result,
    });
};

const handleRemoveUnusedAssets: ToolActionHandler = async ({ client, rawArgs }) => {
    FileRemoveUnusedAssetsSchema.parse(rawArgs);
    const result = await fileApi.removeUnusedAssets(client);
    return createJsonResult({
        success: true,
        ...((result && typeof result === 'object' && !Array.isArray(result)) ? result as Record<string, unknown> : { result }),
    });
};

const handleRenameAsset: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileRenameAssetSchema.parse(rawArgs);
    const result = await fileApi.renameAsset(client, parsed.oldPath, parsed.newName);
    return createJsonResult({
        success: true,
        oldPath: parsed.oldPath,
        newName: parsed.newName,
        ...result,
    });
};

const handleDeleteAsset: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileDeleteAssetSchema.parse(rawArgs);
    const result = await fileApi.deleteAsset(client, parsed.path);
    return createJsonResult({
        success: true,
        path: parsed.path,
        ...((result && typeof result === 'object' && !Array.isArray(result)) ? result as Record<string, unknown> : {}),
    });
};

const handleExtractDoc: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileExtractDocSchema.parse(rawArgs);

    const mdResult = await fileApi.exportMdContent(client, parsed.id);
    const markdown = typeof mdResult.content === 'string' ? mdResult.content : '';
    const hPath = typeof mdResult.hPath === 'string' ? mdResult.hPath : '';

    const docName = hPath.split('/').filter(Boolean).pop()?.replace(/\.sy$/, '') || parsed.id;
    const idSuffix = parsed.id.slice(-7);
    const folderName = `${docName}-${idSuffix}`;

    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const outputRoot = parsed.outputDir
        ? path.resolve(parsed.outputDir)
        : path.join(homeDir, 'siyuan-extracted');
    const defaultOutputDirUsed = !parsed.outputDir;
    const targetDir = path.join(outputRoot, folderName);
    const assetsDir = path.join(targetDir, 'assets');

    if (fs.existsSync(outputRoot)) {
        fs.rmSync(outputRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(assetsDir, { recursive: true });

    const docMdPath = path.join(targetDir, `${docName}.md`);
    fs.writeFileSync(docMdPath, markdown, 'utf-8');

    const assetRefs = [...markdown.matchAll(/\]\(assets\/([^\s)"']+)(?:\s+"[^"]*")?\)/g)];
    const structure = [`${docName}.md`];
    let extractedCount = 0;
    let skippedCount = 0;

    for (const match of assetRefs) {
        const assetRelPath = match[1];
        const assetFullPath = path.join(assetsDir, assetRelPath);

        try {
            fs.mkdirSync(path.dirname(assetFullPath), { recursive: true });
            const data = await client.readFileBinary(`data/assets/${assetRelPath}`);
            fs.writeFileSync(assetFullPath, data);
            structure.push(`assets/${assetRelPath}`);
            extractedCount++;
        } catch {
            skippedCount++;
        }
    }

    return createJsonResult({
        outputRoot,
        defaultOutputDirUsed,
        extractedDir: targetDir,
        docMdFile: `${docName}.md`,
        extractedAssetCount: extractedCount,
        skippedAssetCount: skippedCount,
        structure,
        hint: defaultOutputDirUsed
            ? 'No outputDir was provided, so extract_doc used the default ~/siyuan-extracted/ output root. Pass outputDir explicitly when you need a specific location such as /private/tmp.'
            : 'extract_doc wrote to the explicit outputDir root.',
    });
};

export function createFileActionHandlers(thresholdMB: number, largeUploadThresholdBytes: number): Record<FileAction, ToolActionHandler> {
    return {
        upload_asset: handleUploadAsset(thresholdMB, largeUploadThresholdBytes),
        insert_assets: handleInsertAssets(largeUploadThresholdBytes),
        list_templates: handleListTemplates,
        read_template: handleReadTemplate,
        create_template: handleCreateTemplate,
        update_template: handleUpdateTemplate,
        delete_template: handleDeleteTemplate,
        save_doc_as_template: handleSaveDocAsTemplate,
        render: handleRender,
        export_md: handleExportMd,
        export_resources: handleExportResources,
        list_unused_assets: handleListUnusedAssets,
        get_doc_assets: handleGetDocAssets,
        get_image_ocr_text: handleGetImageOCRText,
        remove_unused_assets: handleRemoveUnusedAssets,
        rename_asset: handleRenameAsset,
        delete_asset: handleDeleteAsset,
        extract_doc: handleExtractDoc,
    };
}
