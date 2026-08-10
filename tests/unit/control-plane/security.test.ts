import { describe, expect, it } from 'vitest';

import { interpretPluginConfig } from '@/control-plane/adapters';
import {
    assertNoSecretLikeText,
    assertReadablePluginFile,
    assertSafeSettingPatch,
    normalizePluginRelativePath,
    redactText,
    sha256,
    stableStringify,
} from '@/control-plane/security';

describe('control-plane security', () => {
    it('rejects traversal, absolute, backslash, binary, and credential-like paths', () => {
        expect(() => normalizePluginRelativePath('../secret')).toThrow('unsafe');
        expect(() => normalizePluginRelativePath('/absolute')).toThrow('safe relative');
        expect(() => normalizePluginRelativePath('nested\\file')).toThrow('safe relative');
        expect(() => assertReadablePluginFile('index.sqlite')).toThrow('Binary');
        expect(() => assertReadablePluginFile('.env')).toThrow('Sensitive');
    });

    it('redacts camelCase JSON secrets recursively without removing safe values', () => {
        const result = redactText(JSON.stringify({ enabled: true, apiKey: 'sensitive', nested: { access_token: 'sensitive' } }));

        expect(JSON.parse(result.content)).toEqual({ enabled: true, apiKey: '[REDACTED]', nested: { access_token: '[REDACTED]' } });
        expect(result.redacted).toBe(true);
    });

    it('rejects secret-like writes and security-weakening setting patches', () => {
        expect(() => assertNoSecretLikeText('authorization = Bearer abcdefghijklmnop')).toThrow('secret');
        expect(() => assertSafeSettingPatch('appearance', { apiKey: 'x' })).toThrow('allowlist');
        expect(() => assertSafeSettingPatch('fileTree', { removeDocWithoutConfirm: true })).toThrow('allowlist');
        expect(() => assertSafeSettingPatch('export', { pandocBin: '/tmp/executable' })).toThrow('allowlist');
        expect(() => assertSafeSettingPatch('editor', { fontSize: 18 })).not.toThrow();
    });

    it('hash canonicalization input is stable across object key order', () => {
        expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
        expect(sha256('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(sha256('思源')).toBe('sha256:4f08835864604dade4571087aeeac73ba8e08ec05ac451c1d695b1817f607245');
    });

    it('keeps adapter inference explicit and preserves unknown fields', () => {
        const fields = interpretPluginConfig('Calendar-heatmap', { enabled: true, color: '#fff', mystery: 7 });

        expect(fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'enabled', category: 'featureSwitches', confidence: 'inferred' }),
            expect.objectContaining({ path: 'color', category: 'appearance', confidence: 'inferred' }),
            expect.objectContaining({ path: 'mystery', category: 'unknown', confidence: 'unknown' }),
        ]));
    });
});
