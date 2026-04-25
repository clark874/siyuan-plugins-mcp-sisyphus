import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    emitToolConfigWarningOnce,
    getLegacyToolConfigWarning,
    resetToolConfigWarningStateForTests,
    warnLegacyToolConfigOnce,
} from '@/core/config';

describe('mcp config legacy warnings', () => {
    beforeEach(() => {
        resetToolConfigWarningStateForTests();
    });

    it('does not warn for nested config', () => {
        const warning = getLegacyToolConfigWarning({
            userRulesText: 'Always set icons.',
            file: {
                enabled: true,
                actions: {
                    upload_asset: false,
                },
            },
        }, 'test config');

        expect(warning).toBeNull();
    });

    it('detects legacy category arrays and flat boolean keys', () => {
        const warning = getLegacyToolConfigWarning({
            notebook: ['list', 'rename'],
            remove_document: true,
        }, 'test config');

        expect(warning).toContain('test config');
        expect(warning).toContain('notebook=[...]');
        expect(warning).toContain('remove_document');
    });

    it('emits each warning only once per process', () => {
        const warn = vi.fn();
        const raw = {
            notebook: ['list'],
        };

        warnLegacyToolConfigOnce(raw, { source: 'test config', warn });
        warnLegacyToolConfigOnce(raw, { source: 'test config', warn });
        emitToolConfigWarningOnce('custom warning', warn);
        emitToolConfigWarningOnce('custom warning', warn);

        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenNthCalledWith(1, expect.stringContaining('Detected legacy tool config format'));
        expect(warn).toHaveBeenNthCalledWith(2, 'custom warning');
    });
});
