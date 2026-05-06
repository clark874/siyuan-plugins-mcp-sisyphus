import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FS_ACTIONS } from '@/core/config';

function readI18n(locale: string): Record<string, unknown> {
    const raw = readFileSync(join(process.cwd(), 'public', 'i18n', `${locale}.json`), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
}

describe('settings i18n', () => {
    it('covers filesystem tool labels in bundled locales', () => {
        for (const locale of ['en_US', 'zh_CN']) {
            const i18n = readI18n(locale);

            expect(i18n.Filesystem).toEqual(expect.any(String));
            expect(i18n.fs_tool_title).toEqual(expect.any(String));
            expect(i18n.fs_tool_desc).toEqual(expect.any(String));

            for (const action of FS_ACTIONS) {
                expect(i18n[`fs_action_${action}`], `${locale} fs_action_${action}`).toEqual(expect.any(String));
                expect(i18n[`desc_fs_action_${action}`], `${locale} desc_fs_action_${action}`).toEqual(expect.any(String));
            }
        }
    });
});
