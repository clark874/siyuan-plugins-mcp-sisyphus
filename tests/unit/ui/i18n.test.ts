import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FEEDBACK_ACTIONS, FS_ACTIONS } from '@/core/config';

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

    it('covers feedback tool labels and form copy in bundled locales', () => {
        const formKeys = [
            'feedbackGroupTitle',
            'feedback_panel_title',
            'feedback_panel_desc',
            'feedback_description_label',
            'feedback_description_placeholder',
            'feedback_impact_label',
            'feedback_impact_placeholder',
            'feedback_suggestion_label',
            'feedback_suggestion_placeholder',
            'feedback_submit_button',
            'feedback_submitting',
            'feedback_submit_success',
            'feedback_submit_success_with_id',
        ];

        for (const locale of ['en_US', 'zh_CN']) {
            const i18n = readI18n(locale);

            expect(i18n.feedback_tool_title).toEqual(expect.any(String));
            expect(i18n.feedback_tool_desc).toEqual(expect.any(String));
            for (const action of FEEDBACK_ACTIONS) {
                expect(i18n[`feedback_action_${action}`], `${locale} feedback_action_${action}`).toEqual(expect.any(String));
                expect(i18n[`desc_feedback_action_${action}`], `${locale} desc_feedback_action_${action}`).toEqual(expect.any(String));
            }
            for (const key of formKeys) {
                expect(i18n[key], `${locale} ${key}`).toEqual(expect.any(String));
            }
        }
    });

    it('covers agent memory settings copy in bundled locales', () => {
        for (const locale of ['en_US', 'zh_CN']) {
            const i18n = readI18n(locale);

            expect(i18n.agent_memory_title, `${locale} agent_memory_title`).toEqual(expect.any(String));
            expect(i18n.agent_memory_desc, `${locale} agent_memory_desc`).toEqual(expect.any(String));
            expect(i18n.agent_memory_placeholder, `${locale} agent_memory_placeholder`).toEqual(expect.any(String));
            expect(i18n.agent_memory_http_restarted, `${locale} agent_memory_http_restarted`).toEqual(expect.any(String));
            expect(i18n.agent_memory_saved_reconnect, `${locale} agent_memory_saved_reconnect`).toEqual(expect.any(String));
            expect(i18n.agent_memory_refresh_failed, `${locale} agent_memory_refresh_failed`).toEqual(expect.any(String));
        }
    });
});
