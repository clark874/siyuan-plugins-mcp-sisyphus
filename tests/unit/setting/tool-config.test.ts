import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig, normalizeToolConfig } from '@/setting/tool-config';

describe('setting tool config', () => {
    it('enables document cover actions by default', () => {
        const config = buildDefaultToolConfig();

        expect(config.document.actions.set_cover).toBe(true);
        expect(config.document.actions.clear_cover).toBe(true);
        expect(config.file.actions.upload_asset).toBe(true);
        expect(config.file.uploadLargeFileThresholdMB).toBe(10);
        expect(config.av.actions.get).toBe(true);
        expect(config.av.actions.set_cell).toBe(true);
        expect(config.flashcard.actions.list_cards).toBe(true);
        expect(config.flashcard.actions.remove_card).toBe(true);
        expect(config.mascot.actions.get_balance).toBe(true);
        expect(config.mascot.actions.shop).toBe(true);
        expect(config.mascot.actions.buy).toBe(true);
        expect(config.userRulesText).toBe('创建文档/日记后主动设图标');
    });

    it('keeps nested file config action toggles and upload threshold together', () => {
        const config = normalizeToolConfig({
            file: {
                enabled: true,
                uploadLargeFileThresholdMB: 25,
                actions: {
                    upload_asset: false,
                    render_template: true,
                },
            },
        });

        expect(config.file.enabled).toBe(true);
        expect(config.file.uploadLargeFileThresholdMB).toBe(25);
        expect(config.file.actions.upload_asset).toBe(false);
        expect(config.file.actions.render_template).toBe(true);
        expect(config.file.actions.render_sprig).toBe(true);
    });

    it('keeps mascot nested action toggles', () => {
        const config = normalizeToolConfig({
            mascot: {
                enabled: true,
                actions: {
                    get_balance: true,
                    shop: false,
                },
            },
        });

        expect(config.mascot.enabled).toBe(true);
        expect(config.mascot.actions.get_balance).toBe(true);
        expect(config.mascot.actions.shop).toBe(false);
        expect(config.mascot.actions.buy).toBe(true);
    });

    it('keeps flashcard nested action toggles', () => {
        const config = normalizeToolConfig({
            flashcard: {
                enabled: true,
                actions: {
                    list_cards: true,
                    remove_card: false,
                },
            },
        });

        expect(config.flashcard.enabled).toBe(true);
        expect(config.flashcard.actions.list_cards).toBe(true);
        expect(config.flashcard.actions.remove_card).toBe(false);
        expect(config.flashcard.actions.review_card).toBe(true);
    });

    it('keeps av nested action toggles', () => {
        const config = normalizeToolConfig({
            av: {
                enabled: true,
                actions: {
                    get: true,
                    set_cell: false,
                },
            },
        });

        expect(config.av.enabled).toBe(true);
        expect(config.av.actions.get).toBe(true);
        expect(config.av.actions.set_cell).toBe(false);
        expect(config.av.actions.batch_set_cells).toBe(true);
    });

    it.each([
        { input: 'bad', expected: 10, label: 'falls back for non-numeric values' },
        { input: 0, expected: 1, label: 'clamps low values to 1' },
        { input: 1.9, expected: 1, label: 'floors decimal values' },
        { input: 9999, expected: 1024, label: 'clamps high values to 1024' },
    ])('$label', ({ input, expected }) => {
        const config = normalizeToolConfig({
            file: {
                enabled: true,
                uploadLargeFileThresholdMB: input,
                actions: {
                    upload_asset: true,
                },
            },
        });

        expect(config.file.uploadLargeFileThresholdMB).toBe(expected);
    });

    it('keeps userRulesText in nested config and defaults it for old config', () => {
        const configWithRules = normalizeToolConfig({
            userRulesText: 'Always prefer setting icons after create.',
            document: {
                enabled: true,
                actions: {
                    create: true,
                },
            },
        });
        const configWithoutRules = normalizeToolConfig({
            document: {
                enabled: true,
                actions: {
                    create: true,
                },
            },
        });

        expect(configWithRules.userRulesText).toBe('Always prefer setting icons after create.');
        expect(configWithoutRules.userRulesText).toBe('创建文档/日记后主动设图标');
    });
});
