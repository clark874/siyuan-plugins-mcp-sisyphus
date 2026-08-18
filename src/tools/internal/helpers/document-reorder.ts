import type { SiYuanClient } from '../../../api/client';
import * as documentApi from '../../../api/document';
import * as notebookApi from '../../../api/notebook';
import type { NotebookConf } from '../../../types/shared';

export const CUSTOM_FILE_TREE_SORT_MODE = 6;
export const DOCUMENT_SORT_MODE_ATTR = 'custom-sy-subdoc-sort-mode';

export const DOCUMENT_SORT_MODE_NAMES: Record<number, string> = {
    0: 'name_ascending',
    1: 'name_descending',
    2: 'updated_ascending',
    3: 'updated_descending',
    4: 'alphanumeric_ascending',
    5: 'alphanumeric_descending',
    6: 'custom',
    7: 'reference_count_ascending',
    8: 'reference_count_descending',
    9: 'created_ascending',
    10: 'created_descending',
    11: 'size_ascending',
    12: 'size_descending',
    13: 'child_count_ascending',
    14: 'child_count_descending',
};

export function getDocumentSortModeName(sortMode: number | null | undefined): string | null {
    return typeof sortMode === 'number' ? DOCUMENT_SORT_MODE_NAMES[sortMode] ?? `unknown_${sortMode}` : null;
}

export interface ReorderChild {
    id: string;
    path: string;
    hPath: string;
    name?: string;
    sort?: number;
}

export interface DocumentReorderState {
    notebook: string;
    parentID: string;
    parentPath: string;
    notebookConf: NotebookConf;
    sortMode?: number;
    declaredSortMode: number | null;
    effectiveSortMode?: number;
    supportsDocumentSortMode: boolean;
    parentScope: 'notebook' | 'document';
    children: ReorderChild[];
}

export interface DocumentChildSortModeState {
    declaredSortMode: number | null;
    effectiveSortMode?: number;
    supportsDocumentSortMode: boolean;
}

function extractDocumentId(path: string): string | undefined {
    return path.split('/').filter(Boolean).at(-1)?.replace(/\.sy$/i, '');
}

function parseDeclaredSortMode(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 14 ? parsed : null;
}

export async function readDocumentChildSortMode(
    client: SiYuanClient,
    notebook: string,
    documentID: string,
    documentPath: string,
): Promise<DocumentChildSortModeState> {
    const [listed, attrs] = await Promise.all([
        documentApi.listDocsByPath(client, notebook, documentPath, {
            maxListCount: 1,
            showHidden: false,
            ignoreMaxListHint: true,
        }),
        client.requestRead<Record<string, string>>('/api/attr/getBlockAttrs', { id: documentID }),
    ]);
    return {
        declaredSortMode: parseDeclaredSortMode(attrs[DOCUMENT_SORT_MODE_ATTR]),
        effectiveSortMode: typeof listed.effectiveSortMode === 'number' ? listed.effectiveSortMode : undefined,
        supportsDocumentSortMode: typeof listed.effectiveSortMode === 'number',
    };
}

export async function readDocumentReorderState(
    client: SiYuanClient,
    notebook: string,
    parentID: string,
    parentPath: string,
): Promise<DocumentReorderState> {
    const parentScope = parentID === notebook && parentPath === '/' ? 'notebook' : 'document';
    const [conf, listed, documentSort] = await Promise.all([
        notebookApi.getNotebookConf(client, notebook),
        documentApi.listDocsByPath(client, notebook, parentPath, {
            sort: CUSTOM_FILE_TREE_SORT_MODE,
            maxListCount: 0,
            showHidden: false,
            ignoreMaxListHint: true,
        }),
        parentScope === 'document'
            ? readDocumentChildSortMode(client, notebook, parentID, parentPath)
            : Promise.resolve<DocumentChildSortModeState>({
                declaredSortMode: null,
                effectiveSortMode: undefined,
                supportsDocumentSortMode: false,
            }),
    ]);
    const children = await Promise.all(listed.files.map(async (file): Promise<ReorderChild> => {
        const id = file.id || extractDocumentId(file.path);
        if (!id) throw new Error(`Unable to resolve a document ID from child path "${file.path}".`);
        const hPath = file.hPath || await documentApi.getHPathByID(client, id);
        return { id, path: file.path, hPath, name: file.name?.replace(/\.sy$/i, ''), sort: file.sort };
    }));
    const notebookSortMode = typeof conf.conf.sortMode === 'number' ? conf.conf.sortMode : undefined;
    const effectiveSortMode = parentScope === 'document'
        ? documentSort.effectiveSortMode ?? notebookSortMode
        : notebookSortMode;
    return {
        notebook,
        parentID,
        parentPath,
        notebookConf: conf.conf,
        sortMode: effectiveSortMode,
        declaredSortMode: parentScope === 'document' ? documentSort.declaredSortMode : notebookSortMode ?? null,
        effectiveSortMode,
        supportsDocumentSortMode: documentSort.supportsDocumentSortMode,
        parentScope,
        children,
    };
}

export function assertExactOrder(current: string[], requested: string[], fieldName: 'orderedIDs' | 'orderedPaths'): void {
    const duplicates = [...new Set(requested.filter((value, index) => requested.indexOf(value) !== index))];
    const currentSet = new Set(current);
    const requestedSet = new Set(requested);
    const missing = current.filter((value) => !requestedSet.has(value));
    const unexpected = requested.filter((value) => !currentSet.has(value));
    if (duplicates.length === 0 && missing.length === 0 && unexpected.length === 0 && requested.length === current.length) return;
    throw new Error(`${fieldName} must contain every visible direct child exactly once. Details: ${JSON.stringify({ duplicates, missing, unexpected })}`);
}

function normalizeFsPath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed) throw new Error('fs path must not be empty.');
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const collapsed = withLeadingSlash.replace(/\/+/g, '/');
    return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
}

export function resolveFsReorderOrder(
    state: DocumentReorderState,
    notebookName: string,
    requestedPaths: string[],
): { currentPaths: string[]; orderedPaths: string[]; orderedIDs: string[] } {
    const currentPaths = state.children.map((child) => normalizeFsPath(`/${notebookName}${child.hPath}`));
    const orderedPaths = requestedPaths.map(normalizeFsPath);
    assertExactOrder(currentPaths, orderedPaths, 'orderedPaths');
    const idByPath = new Map(currentPaths.map((path, index) => [path, state.children[index].id]));
    return { currentPaths, orderedPaths, orderedIDs: orderedPaths.map((path) => idByPath.get(path)!) };
}

export async function applyDocumentReorder(
    client: SiYuanClient,
    state: DocumentReorderState,
    orderedIDs: string[],
): Promise<{ changed: boolean; orderChanged: boolean; sortModeChanged: boolean; sortModeScope: 'notebook' | 'document'; previousOrder: string[]; order: string[] }> {
    const previousOrder = state.children.map((child) => child.id);
    assertExactOrder(previousOrder, orderedIDs, 'orderedIDs');
    const orderChanged = previousOrder.some((id, index) => id !== orderedIDs[index]);
    const sortModeChanged = state.effectiveSortMode !== CUSTOM_FILE_TREE_SORT_MODE;
    const sortModeScope = state.parentScope === 'document' && state.supportsDocumentSortMode ? 'document' : 'notebook';
    if (orderChanged) {
        const childByID = new Map(state.children.map((child) => [child.id, child]));
        await documentApi.changeFileTreeSort(client, state.notebook, orderedIDs.map((id) => childByID.get(id)!.path));
    }
    if (sortModeChanged) {
        if (sortModeScope === 'document') {
            await documentApi.setDocSortMode(client, state.parentID, CUSTOM_FILE_TREE_SORT_MODE);
        } else {
            await notebookApi.setNotebookConf(client, state.notebook, { sortMode: CUSTOM_FILE_TREE_SORT_MODE });
        }
    }
    return { changed: orderChanged || sortModeChanged, orderChanged, sortModeChanged, sortModeScope, previousOrder, order: orderedIDs };
}
