import type { SiYuanClient } from './client';

export const CONTROLLED_SETTING_SECTIONS = ['editor', 'export', 'fileTree', 'search', 'keymap', 'appearance', 'flashcard', 'snippet'] as const;
export type ControlledSettingSection = typeof CONTROLLED_SETTING_SECTIONS[number];

const ENDPOINTS: Record<ControlledSettingSection, string> = {
    editor: '/api/setting/setEditor',
    export: '/api/setting/setExport',
    fileTree: '/api/setting/setFiletree',
    search: '/api/setting/setSearch',
    keymap: '/api/setting/setKeymap',
    appearance: '/api/setting/setAppearance',
    flashcard: '/api/setting/setFlashcard',
    snippet: '/api/setting/setSnippet',
};

export async function getControlledSetting(
    client: SiYuanClient,
    section: ControlledSettingSection,
): Promise<Record<string, unknown>> {
    const response = await client.request<unknown>('/api/system/getConf', {});
    if (response === null || typeof response !== 'object') throw new Error('SiYuan configuration response is malformed.');
    const conf = (response as { conf?: unknown }).conf;
    if (conf === null || typeof conf !== 'object') throw new Error('SiYuan configuration does not contain conf.');
    const value = (conf as Record<string, unknown>)[section];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Controlled setting section is unavailable: ${section}`);
    }
    return structuredClone(value as Record<string, unknown>);
}

export async function setControlledSetting(
    client: SiYuanClient,
    section: ControlledSettingSection,
    value: Record<string, unknown>,
): Promise<unknown> {
    const payload = section === 'keymap' ? { data: value } : value;
    return client.request(ENDPOINTS[section], payload);
}
