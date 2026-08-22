import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface LocalAssetInput {
    localPath: string;
    name?: string;
    title?: string;
}

export interface PreparedLocalAsset {
    localPath: string;
    basename: string;
    kind: 'image' | 'file' | 'directory';
    name: string;
    title?: string;
    sizeBytes?: number;
}

export interface AssetPreflightResult {
    items: PreparedLocalAsset[];
    largeFiles: Array<{ localPath: string; sizeBytes: number }>;
}

const IMAGE_EXTENSIONS = new Set([
    '.apng', '.ico', '.cur', '.jpg', '.jpe', '.jpeg', '.jfif', '.pjp', '.pjpeg', '.png', '.gif',
    '.webp', '.bmp', '.svg', '.avif', '.tiff', '.tif',
]);

export async function preflightLocalAssets(
    inputs: LocalAssetInput[],
    largeFileThresholdBytes: number,
): Promise<AssetPreflightResult> {
    if (inputs.length === 0) throw new Error('At least one local asset is required.');
    const items: PreparedLocalAsset[] = [];
    const basenames = new Set<string>();
    const largeFiles: Array<{ localPath: string; sizeBytes: number }> = [];

    for (const input of inputs) {
        const localPath = path.resolve(input.localPath);
        const stat = await fs.stat(localPath).catch(() => null);
        if (!stat) throw new Error(`Local asset does not exist: ${localPath}`);
        if (!stat.isFile() && !stat.isDirectory()) {
            throw new Error(`Local asset must be a regular file or directory: ${localPath}`);
        }
        const basename = path.basename(localPath);
        const basenameKey = basename.toLocaleLowerCase();
        if (basenames.has(basenameKey)) throw new Error(`Duplicate asset basename: ${basename}`);
        basenames.add(basenameKey);
        const kind = stat.isDirectory()
            ? 'directory' as const
            : IMAGE_EXTENSIONS.has(path.extname(basename).toLocaleLowerCase())
                ? 'image' as const
                : 'file' as const;
        const defaultName = kind === 'image' ? basename.slice(0, Math.max(0, basename.length - path.extname(basename).length)) : basename;
        const item: PreparedLocalAsset = {
            localPath,
            basename,
            kind,
            name: input.name?.trim() || defaultName,
            ...(input.title?.trim() ? { title: input.title.trim() } : {}),
            ...(stat.isFile() ? { sizeBytes: stat.size } : {}),
        };
        items.push(item);
        if (stat.isFile() && stat.size > largeFileThresholdBytes) {
            largeFiles.push({ localPath, sizeBytes: stat.size });
        }
    }

    return { items, largeFiles };
}

export function renderInsertedAssetMarkdown(item: PreparedLocalAsset, resolvedPath: string): string {
    const name = escapeMarkdownLabel(item.name);
    const title = item.title ? ` "${item.title.replace(/(["\\])/g, '\\$1')}"` : '';
    return item.kind === 'image'
        ? `![${name}](${resolvedPath}${title})`
        : `[${name}](${resolvedPath}${title})`;
}

function escapeMarkdownLabel(value: string): string {
    return value.replace(/([\[\]\\])/g, '\\$1');
}
