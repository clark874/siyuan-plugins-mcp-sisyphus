import { describe, expect, it, vi } from 'vitest';

import { acquireTargetLock, releaseTargetLock } from '@/control-plane/record-storage';

describe('control-plane persistent locks', () => {
    it('uses the kernel rename conflict contract to exclude a second process', async () => {
        const files = new Map<string, string>();
        const directories = new Set<string>();
        const client = {
            createDirectory: vi.fn(async (path: string) => { directories.add(path); }),
            writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
            readFileTextLimited: vi.fn(async (path: string) => {
                const content = files.get(path);
                if (content === undefined) throw new Error('missing');
                return { content, byteLength: content.length };
            }),
            request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
                if (endpoint === '/api/file/renameFile') {
                    const source = String(body?.path);
                    const destination = String(body?.newPath);
                    if (directories.has(destination)) throw new Error('path already exists');
                    if (!directories.has(source)) throw new Error('source missing');
                    directories.delete(source);
                    directories.add(destination);
                    for (const [path, content] of [...files]) {
                        if (!path.startsWith(`${source}/`)) continue;
                        files.delete(path);
                        files.set(`${destination}${path.slice(source.length)}`, content);
                    }
                    return null;
                }
                if (endpoint === '/api/file/removeFile') {
                    const path = String(body?.path);
                    directories.delete(path);
                    for (const filePath of [...files.keys()]) {
                        if (filePath === path || filePath.startsWith(`${path}/`)) files.delete(filePath);
                    }
                    return null;
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            }),
        };

        const first = await acquireTargetLock(client as never, 'snippets:collection');
        expect(files.get(`${first.path}/owner.json`)).not.toContain('expiresAt');
        await expect(acquireTargetLock(client as never, 'snippets:collection')).rejects.toThrow('already in progress');
        await releaseTargetLock(client as never, first);
        const next = await acquireTargetLock(client as never, 'snippets:collection');
        expect(next.owner).not.toBe(first.owner);
        await releaseTargetLock(client as never, next);
    });
});
