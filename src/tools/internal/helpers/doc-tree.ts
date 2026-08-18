import type { SiYuanClient } from '../../../api/client';
import * as documentApi from '../../../api/document';
import { listChildDocumentsByPath } from '../context';

/** Storage-path spellings that address a notebook root rather than a document. */
export function isNotebookRootPath(path: string | undefined): boolean {
    const trimmed = (path ?? '').trim();
    return trimmed === '' || trimmed === '/';
}

/** Kernel tree payloads arrive either bare or wrapped in a `tree` field. */
export function extractTreeArray(result: unknown): unknown[] {
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).tree)) {
        return (result as Record<string, unknown>).tree as unknown[];
    }
    return [];
}

/**
 * Tree nodes for a notebook root.
 *
 * `listDocTree` rejects the notebook root with "path escapes notebook
 * directory", so the root level is read with `listDocsByPath` and each
 * top-level document is expanded with its own `listDocTree` call. That is
 * `1 + K` kernel calls for `K` top-level documents, instead of one call per
 * directory in the notebook.
 *
 * Nodes carry the same `id` + `children` shape the kernel returns, so callers
 * can resolve display names exactly as they do for document subtrees.
 */
export async function listNotebookRootTreeNodes(client: SiYuanClient, notebook: string): Promise<unknown[]> {
    const children = await listChildDocumentsByPath(client, notebook, '/');
    return Promise.all(children.map(async (child) => ({
        id: child.id,
        children: child.path
            ? extractTreeArray(await documentApi.listDocTree(client, notebook, child.path).catch(() => null))
            : [],
    })));
}
