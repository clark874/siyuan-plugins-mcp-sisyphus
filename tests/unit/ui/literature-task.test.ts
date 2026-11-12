import { describe, expect, it, vi } from 'vitest';

vi.mock('@/ui/setting/mcp-config.svelte', () => ({ default: class {} }));
vi.mock('@/ui/literature/TranslationPanel.svelte', () => ({ default: class {} }));
vi.mock('@/ui/version-control/SnapshotPanel.svelte', () => ({ default: class {} }));
vi.mock('@/ui/version-control/VersionDiffPanel.svelte', () => ({ default: class {} }));
vi.mock('@/ui/recent-documents/RecentDocumentsPanel.svelte', () => ({ default: class {} }));
vi.mock('@/ui/literature/desktop-runner', () => ({ runLiteratureTask: vi.fn(), runMdtxBridge: vi.fn() }));

import Plugin from '@/index';
import { runLiteratureTask } from '@/ui/literature/desktop-runner';

function readingPlugin() {
    const plugin = new Plugin() as any;
    plugin.literatureDocument = { id: '20261112233241-3d12594', title: '论文' };
    plugin.showTranslationDock = vi.fn();
    plugin.updateTranslationDocument = vi.fn();
    plugin.literatureReading.open = vi.fn();
    plugin.translationPanel = { $set: vi.fn() };
    return plugin;
}

describe('文献翻译按钮入口', () => {
    it('先预检，发现已核验译文便直接打开对照', async () => {
        const plugin = readingPlugin();
        vi.mocked(runLiteratureTask).mockResolvedValueOnce({ status: 'ready', message: '已有译文', willInvokeModel: false });
        await plugin.requestLiteratureTranslation(plugin.literatureDocument.id);
        expect(runLiteratureTask).toHaveBeenCalledTimes(1);
        expect(vi.mocked(runLiteratureTask).mock.calls[0][3]).toEqual(['--inspect']);
        expect(plugin.literatureReading.open).toHaveBeenCalledWith(plugin.literatureDocument.id, true);
    });

    it('复用缓存时可从按钮取消，保留退出状态并解除运行标记', async () => {
        const plugin = readingPlugin();
        const plan = { status: 'cached', message: '复用缓存', sourceDigest: 'source-version', willInvokeModel: false };
        vi.mocked(runLiteratureTask).mockResolvedValueOnce(plan);
        vi.mocked(runLiteratureTask).mockImplementationOnce(async (...args) => {
            expect(args[3]).toEqual(['--interactive']);
            expect(args[4]).toMatchObject({ expectedSourceDigest: 'source-version', allowModel: false });
            const signal = args[7] as AbortSignal;
            await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
            return { cancelled: true };
        });
        const running = plugin.requestLiteratureTranslation(plugin.literatureDocument.id);
        await vi.waitFor(() => expect(plugin.translationsRunning.size).toBe(1));
        plugin.cancelLiteratureTranslation(plugin.literatureDocument.id);
        await running;
        expect(plugin.translationsRunning.size).toBe(0);
        expect(plugin.translationControllers.size).toBe(0);
        expect(plugin.translationPanel.$set).toHaveBeenCalledWith(expect.objectContaining({ running: false, cancelling: false }));
        expect(plugin.literatureReading.open).not.toHaveBeenCalled();
    });
});
