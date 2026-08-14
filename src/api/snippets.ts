import type { SiYuanClient } from './client';

export type SnippetType = 'js' | 'css';

export interface SiYuanSnippet {
    id: string;
    name: string;
    type: SnippetType;
    enabled: boolean;
    disabledInPublish: boolean;
    content: string;
}

function normalizeSnippet(value: unknown): SiYuanSnippet | null {
    if (value === null || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.content !== 'string') return null;
    if (raw.type !== 'js' && raw.type !== 'css') return null;
    return {
        id: raw.id,
        name: raw.name,
        type: raw.type,
        enabled: raw.enabled === true,
        disabledInPublish: raw.disabledInPublish === true,
        content: raw.content,
    };
}

export async function getSnippets(
    client: SiYuanClient,
    type: SnippetType | 'all' = 'all',
    enabled: 0 | 1 | 2 = 2,
    keyword = '',
): Promise<SiYuanSnippet[]> {
    const response = await client.requestRead<unknown>('/api/snippet/getSnippet', { type, enabled, keyword });
    if (response === null || typeof response !== 'object') return [];
    const rawSnippets = (response as { snippets?: unknown }).snippets;
    if (!Array.isArray(rawSnippets)) return [];
    return rawSnippets.map(normalizeSnippet).filter((item): item is SiYuanSnippet => item !== null);
}

export async function setSnippets(client: SiYuanClient, snippets: SiYuanSnippet[]): Promise<void> {
    await client.requestWrite<null>('/api/snippet/setSnippet', { snippets });
}

export async function removeSnippet(client: SiYuanClient, id: string): Promise<SiYuanSnippet | null> {
    const response = await client.requestWrite<unknown>('/api/snippet/removeSnippet', { id });
    return normalizeSnippet(response);
}
