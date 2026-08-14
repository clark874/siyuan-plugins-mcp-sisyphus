import { describe, expect, it } from 'vitest';

import { validateSourceAuditBundle } from '@/shared/source-audit-contract';

const bundle = {
    inventory: {
        schemaVersion: 1,
        items: [{
            id: 'change-edge-weight',
            file: 'src/network.py',
            symbol: 'build_graph',
            lineStart: 10,
            lineEnd: 24,
            beforeBehavior: 'Count weighted values',
            afterBehavior: 'Count group membership',
            risk: 'high',
            evidenceHash: 'a'.repeat(64),
        }],
    },
    usageMap: {
        schemaVersion: 1,
        projects: [{
            id: 'project-a',
            name: 'Project A',
            usages: [{ inventoryId: 'change-edge-weight', status: 'risky', evidence: ['analysis.py:42'] }],
        }],
    },
    baselinesMarkdown: [
        '# Baselines',
        '- upstream: `0123456789abcdef0123456789abcdef01234567`',
        `- snapshot-sha256: ${'b'.repeat(64)}`,
    ].join('\n'),
};

describe('source audit contract', () => {
    it('accepts a complete frozen handoff and returns a deterministic summary', () => {
        const result = validateSourceAuditBundle(bundle);
        expect(result.valid).toBe(true);
        expect(result.summary).toMatchObject({ inventoryItems: 1, projects: 1, usageRecords: 1 });
        expect(result.bundleHash).toMatch(/^sha256:v1:[a-f0-9]{64}$/);
    });

    it('rejects unknown inventory references and invalid evidence hashes', () => {
        const invalid = structuredClone(bundle);
        invalid.inventory.items[0].evidenceHash = 'not-a-hash';
        invalid.usageMap.projects[0].usages[0].inventoryId = 'missing-change';

        const result = validateSourceAuditBundle(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors.join('\n')).toContain('evidenceHash');
        expect(result.errors.join('\n')).toContain('missing-change');
    });

    it('does not infer conclusions from omitted source contents', () => {
        const result = validateSourceAuditBundle(bundle);
        expect(result).not.toHaveProperty('conclusions');
        expect(result.hint).toContain('does not verify source code');
    });
});
