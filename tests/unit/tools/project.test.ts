import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { listAllTools } from '@/core/tool-registry';
import { callProjectTool, listProjectTools } from '@/tools/project';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';
import { parseResult } from '../../helpers/parse-result';

describe('project tool', () => {
    const originalHostId = process.env.SIYUAN_MCP_HOST_ID;

    afterEach(() => {
        if (originalHostId === undefined) delete process.env.SIYUAN_MCP_HOST_ID;
        else process.env.SIYUAN_MCP_HOST_ID = originalHostId;
    });

    it('保留只读快照并披露原生导图写入动作', () => {
        const [tool] = listProjectTools(buildDefaultToolConfig().project);
        expect(tool.inputSchema.properties.action).toBeDefined();
        expect(JSON.stringify(tool.inputSchema)).toContain('projectName');
        expect(listAllTools(buildDefaultToolConfig()).find((item) => item.name === 'project')?.annotations?.readOnlyHint).toBe(false);
    });

    it('returns one bounded snapshot without exposing workspaceRoot', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-snapshot-'));
        const workspaceRoot = path.join(root, ...Array(4).fill('a'.repeat(90)));
        fs.mkdirSync(workspaceRoot, { recursive: true });
        process.env.SIYUAN_MCP_HOST_ID = 'host-test';
        fs.writeFileSync(path.join(workspaceRoot, 'result.txt'), 'ok');
        const attrs: Record<string, Record<string, string>> = {
            page: { 'custom-progress-role': 'project-progress-page', 'custom-progress-project-id': 'project-a' },
            profile: { 'custom-progress-role': 'project-profile', 'custom-progress-project-id': 'project-a' },
            stages: { 'custom-progress-role': 'stage-ledger', 'custom-progress-project-id': 'project-a' },
            artifacts: { 'custom-progress-role': 'artifact-index', 'custom-progress-project-id': 'project-a' },
            state: { 'custom-progress-role': 'project-state', 'custom-progress-project-id': 'project-a', 'custom-progress-last-event-id': 'event' },
            workstream: { 'custom-progress-role': 'workstream-state', 'custom-progress-project-id': 'project-a', 'custom-progress-workstream': 'analysis', 'custom-progress-last-event-id': 'event' },
            event: {
                'custom-provenance-kind': 'event',
                'custom-provenance-project-id': 'project-a',
                'custom-provenance-event-id': 'event-1',
                'custom-provenance-occurred-at': '2026-09-04T00:00:00.000Z',
                'custom-provenance-source-provider': 'codex',
                'custom-provenance-source-session': 'session-1',
                'custom-provenance-compile-provider': 'codex',
                'custom-provenance-compile-session': 'session-1',
                'custom-provenance-target-atom-ids': '["atom-1"]',
                'custom-progress-role': 'event',
                'custom-progress-schema': '1',
                'custom-progress-workstream': 'analysis',
                'custom-progress-kind': 'knowledge',
            },
            backfill: {
                'custom-provenance-kind': 'event',
                'custom-provenance-project-id': 'project-a',
                'custom-provenance-event-id': 'event-backfill',
                'custom-provenance-occurred-at': '2026-09-01T00:00:00.000Z',
                'custom-provenance-source-provider': 'codex',
                'custom-provenance-source-session': 'session-1',
                'custom-provenance-compile-provider': 'codex',
                'custom-provenance-compile-session': 'session-1',
                'custom-provenance-target-atom-ids': '["atom-1"]',
                'custom-progress-role': 'event',
                'custom-progress-schema': '1',
                'custom-progress-workstream': 'analysis',
                'custom-progress-kind': 'knowledge',
            },
            session: {
                'custom-provenance-provider': 'codex',
                'custom-provenance-session-id': 'session-1',
                'custom-provenance-project-id': 'project-a',
                'custom-provenance-host-alias': 'remote',
                'custom-provenance-capture-method': 'explicit',
                'custom-provenance-first-seen-at': '2026-09-04T00:00:00.000Z',
                'custom-provenance-last-seen-at': '2026-09-04T00:00:00.000Z',
            },
            'atom-1': { name: 'atom-one', 'custom-atom-type': 'evidence', 'custom-verification-status': 'source-checked' },
        };
        const registry = {
            schemaVersion: 1,
            updatedAt: '2026-09-04T00:00:00.000Z',
            projects: [{
                projectId: 'project-a',
                hubBlockId: 'hub',
                sourceKind: 'directory',
                revision: 'directory:test',
                coverage: 'curated',
                coreFiles: [{ relativePath: 'result.txt', role: 'output' }],
                includePaths: [],
                exclusions: [],
                bindings: {
                    'host-test': { hostId: 'host-test', workspaceRoot, checkoutKind: 'plain-directory', revision: 'directory:test', verifiedAt: '2026-09-04T00:00:00.000Z', access: 'read-only', status: 'available' },
                },
                manifest: {
                    generatedAt: '2026-09-04T00:00:00.000Z', coverage: 'curated', revision: 'directory:test', manifestHash: 'sha256:v1:test', counts: { a: 1, b: 0, c: 0 },
                    entries: [{ relativePath: 'result.txt', tier: 'A', role: 'output', type: 'text', size: 2, modifiedAt: '2026-09-04T00:00:00.000Z', sourceRevision: 'directory:test', hash: 'sha256:v1:file' }],
                    exclusions: [], missingCore: [], truncated: false,
                },
                updatedAt: '2026-09-04T00:00:00.000Z',
            }],
        };
        const rows: Record<string, Record<string, unknown>> = {
            hub: { id: 'hub', root_id: 'hub', box: 'nb', path: '/hub.sy', hpath: '/Project A', content: 'Project A', type: 'd' },
            page: { id: 'page', root_id: 'page', box: 'nb', path: '/page.sy', hpath: '/Project A/Progress', content: 'Progress', type: 'd', created: '20260904000000' },
            profile: { id: 'profile', root_id: 'page', box: 'nb', path: '/page.sy', content: 'Profile', type: 'p' },
            stages: { id: 'stages', root_id: 'page', box: 'nb', path: '/page.sy', content: 'Stages', type: 'p' },
            artifacts: { id: 'artifacts', root_id: 'page', box: 'nb', path: '/page.sy', content: 'Artifacts', type: 'p' },
            state: { id: 'state', root_id: 'page', parent_id: 'page', box: 'nb', path: '/page.sy', content: 'Current Project State', type: 'h', sort: 10 },
            'state-body': { id: 'state-body', root_id: 'page', parent_id: 'page', box: 'nb', path: '/page.sy', content: 'State body', type: 'p', sort: 20 },
            workstream: { id: 'workstream', root_id: 'page', box: 'nb', path: '/page.sy', content: 'Workstream', type: 'p' },
            event: { id: 'event', root_id: 'hub', box: 'nb', path: '/hub.sy', content: 'Event', type: 'p', created: '20260904010000' },
            backfill: { id: 'backfill', root_id: 'hub', box: 'nb', path: '/hub.sy', content: 'Backfill', type: 'p', created: '20260905010000' },
            session: { id: 'session', root_id: 'hub', box: 'nb', path: '/hub.sy', content: 'Session', type: 'p' },
            'atom-1': { id: 'atom-1', root_id: 'hub', box: 'nb', path: '/hub.sy', hpath: '/Project A/Atom', content: 'Atom One', type: 'p', updated: '20260904010000' },
        };
        const sourceIds = Array.from({ length: 24 }, (_, index) => `source-${index}`);
        for (const id of [...sourceIds, 'source-conflict', 'source-denied']) {
            rows[id] = { id, root_id: id, box: id === 'source-denied' ? 'denied' : 'nb', path: `/${id}.sy`, content: '资料全文'.repeat(1000), type: 'd' };
            attrs[id] = {
                'custom-source-project-id': 'project-a',
                'custom-source-role': id === 'source-1' ? 'source-entry' : 'source-document',
                'custom-source-url': 'https://example.org/source',
                'custom-verification-status': 'source-checked',
            };
        }
        delete attrs['source-0']['custom-source-project-id'];
        attrs['source-0']['custom-provenance-project-id'] = 'project-a';
        attrs['source-conflict']['custom-provenance-project-id'] = 'another-project';
        const longJson = JSON.stringify({ records: Array.from({ length: 30 }, (_, index) => ({ id: `record-${index}`, content: '状态记录'.repeat(10) })) });
        const longPath = `/资料/${'原始路径/'.repeat(80)}source.md`;
        attrs.profile['custom-progress-note'] = longJson;
        attrs.state['custom-progress-state-json'] = longJson;
        rows['source-0'].hpath = longPath;
        attrs['source-0']['custom-source-path'] = '/private/unregistered/source.md';
        attrs['source-0']['custom-source-manifest'] = '/private/unregistered/manifest.json';
        attrs['source-0']['custom-source-url'] = `https://example.org/${'source/'.repeat(80)}`;
        const permissions = createMockPermissionManager({ canRead: (notebookId) => notebookId !== 'denied' });
        const client = createMockClient({
            readFile: async () => `${JSON.stringify(registry)}\n`,
            request: async (endpoint: string, body?: Record<string, unknown>) => {
                if (endpoint === '/api/query/sql') {
                    const stmt = String(body?.stmt || '');
                    const exactId = stmt.match(/WHERE id='([^']+)' LIMIT 1/)?.[1]
                        || stmt.match(/WHERE id = '([^']+)' LIMIT 1/)?.[1];
                    if (exactId) return rows[exactId] ? [rows[exactId]] : [];
                    if (stmt.includes("name='custom-source-role'")) {
                        expect(stmt).not.toContain('LIKE');
                        expect(stmt).not.toContain('alias');
                        return [...sourceIds, 'source-conflict', 'source-denied'].map((id) => rows[id]);
                    }
                    if (stmt.includes("custom-progress-role' AND r.value IN")) return ['page', 'profile', 'stages', 'artifacts', 'state', 'workstream'].map((id) => rows[id]);
                    if (stmt.includes("WHERE root_id='page' ORDER BY sort ASC LIMIT 500")) return [rows.state, rows['state-body']];
                    if (stmt.includes('ORDER BY b.created DESC LIMIT 501')) {
                        expect(stmt).toContain('WHERE b.id IN (SELECT block_id FROM attributes');
                        expect(stmt).toContain(' UNION ');
                        expect(stmt).not.toContain('EXISTS');
                        return [rows.backfill, rows.event];
                    }
                    if (stmt.includes('FROM refs')) return [
                        { block_id: 'event', def_block_id: 'atom-1' },
                        { block_id: 'backfill', def_block_id: 'atom-1' },
                    ];
                    if (stmt.includes("custom-provenance-kind' AND k.value='session'")) return [{ id: 'session' }];
                    const ids = stmt.match(/WHERE id IN \(([^)]+)\)/)?.[1];
                    if (ids) return [...ids.matchAll(/'([^']+)'/g)].flatMap((match) => rows[match[1]] ? [rows[match[1]]] : []);
                    return [];
                }
                if (endpoint === '/api/attr/batchGetBlockAttrs') {
                    return Object.fromEntries((body?.ids as string[]).map((id) => [id, attrs[id] || {}]));
                }
                if (endpoint === '/api/attr/getBlockAttrs') return attrs[String(body?.id)] || {};
                if (endpoint === '/api/block/getBlockKramdowns') {
                    return Object.fromEntries((body?.ids as string[]).map((id) => [id, id === 'artifacts' ? '- output | result.txt | current' : rows[id]?.content || '']));
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            },
        });
        try {
            const result = parseResult(await callProjectTool(client, { action: 'snapshot', projectId: 'project-a' }, buildDefaultToolConfig().project, permissions));
            expect(result.status).toBe('ready');
            expect(result.events.map((event: { id: string }) => event.id)).toEqual(['event', 'backfill']);
            expect(result.events[0]).toMatchObject({
                occurredAt: '2026-09-04T00:00:00.000Z',
                recordedAt: '20260904010000',
                timeBasis: 'provenance',
            });
            expect(result.chronology).toMatchObject({
                complete: true,
                scannedCount: 2,
                projectHead: { id: 'event' },
                workstreamHeads: [{ workstream: 'analysis', id: 'event' }],
            });
            expect(result.knowledgeProducts[0]).toMatchObject({ id: 'atom-1', name: 'atom-one', verificationStatus: 'source-checked' });
            expect(result.knowledgeProducts).toHaveLength(20);
            expect(result.knowledgeProducts[1]).toMatchObject({ id: 'source-0', productType: 'source-document', projectId: 'project-a', hpath: longPath, sourceMetadata: { 'custom-source-url': attrs['source-0']['custom-source-url'] } });
            expect(result.knowledgeProducts[1].sourceMetadata).not.toHaveProperty('custom-source-path');
            expect(result.knowledgeProducts[1].sourceMetadata).not.toHaveProperty('custom-source-manifest');
            expect(result.knowledgeProducts[2].productType).toBe('source-entry');
            expect(result.pagination.knowledgeProducts).toMatchObject({ total: 25, returned: 20, hasMore: true });
            expect(result.summary).toMatchObject({ truncated: true, fields: expect.arrayContaining([expect.objectContaining({ path: 'knowledgeProducts', total: 25, returned: 20 })]) });
            expect(result.summary.completeRead).toContain('view="full"');
            expect(JSON.parse(result.projections.projectProfile.attributes['custom-progress-note'])).toEqual(JSON.parse(longJson));
            expect(result.artifacts[0].resolvedPath).toBe(path.join(fs.realpathSync(workspaceRoot), 'result.txt'));
            expect(result.artifacts[0].resolvedPath.length).toBeGreaterThan(320);
            expect(result.diagnostics).toEqual(expect.arrayContaining([{ code: 'legacy_projection_layout', severity: 'warning', status: 'stale', message: expect.any(String) }, expect.objectContaining({ code: 'source_project_conflict', blockId: 'source-conflict' })]));
            expect(result.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'project_state_lagging' })]));
            expect(result.repairPlan).toMatchObject({
                status: 'preview',
                action: 'block.set_attrs',
                items: expect.arrayContaining([
                    { id: 'state-body', attrs: expect.objectContaining({ 'custom-progress-role': 'project-state' }) },
                    { id: 'state', attrs: expect.objectContaining({ 'custom-progress-role': '' }) },
                ]),
            });
            expect(result.repairPlan.items.find((item: { id: string }) => item.id === 'state-body').attrs['custom-progress-state-json']).toBe(longJson);
            expect(result.progressPage).not.toHaveProperty('kramdown');
            expect(result.projections.projectProfile).not.toHaveProperty('kramdown');
            expect(result.events[0]).not.toHaveProperty('kramdown');
            expect(result.project).not.toHaveProperty('workspaceRoot');
            expect(result).not.toHaveProperty('workspaceRoot');
            const byName = parseResult(await callProjectTool(client, { action: 'snapshot', projectName: 'Project A' }, buildDefaultToolConfig().project, createMockPermissionManager()));
            expect(byName.project).toMatchObject({ projectId: 'project-a', matchType: 'project-name' });
            const byCwd = parseResult(await callProjectTool(client, { action: 'snapshot', cwd: fs.realpathSync(workspaceRoot) }, buildDefaultToolConfig().project, createMockPermissionManager()));
            expect(byCwd.project).toMatchObject({ projectId: 'project-a', matchType: 'exact' });
            const full = parseResult(await callProjectTool(client, { action: 'snapshot', projectId: 'project-a', view: 'full' }, buildDefaultToolConfig().project, permissions));
            expect(full.projections.projectProfile.kramdown).toBe('Profile');
            expect(full.events[0].kramdown).toBe('Event');
            expect(full.knowledgeProducts).toHaveLength(25);
            expect(full.knowledgeProducts[1].title).toBe('资料全文'.repeat(1000));
            expect(full.knowledgeProducts.map((row: { id: string }) => row.id)).not.toContain('source-conflict');
            expect(full.knowledgeProducts.map((row: { id: string }) => row.id)).not.toContain('source-denied');
            expect(full.projections.projectProfile.attributes['custom-progress-note']).toBe(longJson);
            expect(result.repairPlan).toEqual(full.repairPlan);
            expect(result.chronology).toEqual(full.chronology);
            expect(result.diagnostics).toEqual(full.diagnostics);
            expect(full.knowledgeProducts[1].sourceMetadata).not.toHaveProperty('custom-source-path');
            expect(full.knowledgeProducts[1].sourceMetadata).not.toHaveProperty('custom-source-manifest');
            expect(full).not.toHaveProperty('summary');
            expect(JSON.stringify(result).length).toBeLessThan(JSON.stringify(full).length / 2);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('超过 500 条事件时停止输出权威时间线头部', async () => {
        const eventRows = Array.from({ length: 501 }, (_, index) => ({
            id: `event-${index}`,
            box: 'nb',
            root_id: 'page',
            content: `Event ${index}`,
            created: `20260904${String(index % 24).padStart(2, '0')}0000`,
            type: 'p',
        }));
        const registry = {
            schemaVersion: 1,
            updatedAt: '2026-09-04T00:00:00.000Z',
            projects: [{
                projectId: 'project-many', hubBlockId: 'hub', sourceKind: 'directory', revision: 'directory:test', coverage: 'curated',
                coreFiles: [], includePaths: [], exclusions: [], bindings: {},
                manifest: { generatedAt: '2026-09-04T00:00:00.000Z', coverage: 'curated', revision: 'directory:test', manifestHash: 'sha256:v1:test', counts: { a: 0, b: 0, c: 0 }, entries: [], exclusions: [], missingCore: [], truncated: false },
                updatedAt: '2026-09-04T00:00:00.000Z',
            }],
        };
        const projectionRows = [
            { id: 'page', box: 'nb', root_id: 'page', content: 'Progress', type: 'd' },
            { id: 'profile', box: 'nb', root_id: 'page', content: 'Profile', type: 'p' },
            { id: 'stages', box: 'nb', root_id: 'page', content: 'Stages', type: 'p' },
            { id: 'artifacts', box: 'nb', root_id: 'page', content: 'Artifacts', type: 'p' },
            { id: 'state', box: 'nb', root_id: 'page', content: 'State', type: 'p' },
        ];
        const roleById: Record<string, string> = { page: 'project-progress-page', profile: 'project-profile', stages: 'stage-ledger', artifacts: 'artifact-index', state: 'project-state' };
        const client = createMockClient({
            readFile: async () => `${JSON.stringify(registry)}\n`,
            request: async (endpoint: string, body?: Record<string, unknown>) => {
                if (endpoint === '/api/query/sql') {
                    const stmt = String(body?.stmt || '');
                    const exactId = stmt.match(/WHERE id='([^']+)' LIMIT 1/)?.[1]
                        || stmt.match(/WHERE id = '([^']+)' LIMIT 1/)?.[1];
                    if (exactId === 'hub') return [{ id: 'hub', box: 'nb', root_id: 'hub', path: '/hub.sy', content: 'Project Many', type: 'd' }];
                    if (exactId) {
                        const projection = projectionRows.find((row) => row.id === exactId);
                        const event = eventRows.find((row) => row.id === exactId);
                        return projection ? [{ ...projection, path: '/page.sy' }] : event ? [{ ...event, path: '/page.sy' }] : [];
                    }
                    if (stmt.includes("custom-progress-role' AND r.value IN")) return projectionRows;
                    if (stmt.includes('ORDER BY b.created DESC LIMIT 501')) return eventRows;
                    return [];
                }
                if (endpoint === '/api/attr/batchGetBlockAttrs') {
                    return Object.fromEntries((body?.ids as string[]).map((id) => [id, roleById[id]
                        ? { 'custom-progress-role': roleById[id], 'custom-progress-project-id': 'project-many' }
                        : { 'custom-progress-role': 'event', 'custom-progress-project-id': 'project-many', 'custom-progress-workstream': 'analysis', 'custom-progress-kind': 'progress', 'custom-progress-occurred-at': '2026-09-04T00:00:00.000Z' }]));
                }
                if (endpoint === '/api/block/getBlockKramdowns') return Object.fromEntries((body?.ids as string[]).map((id) => [id, id]));
                if (endpoint === '/api/attr/getBlockAttrs') return {};
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            },
        });
        const result = parseResult(await callProjectTool(client, { action: 'snapshot', projectId: 'project-many' }, buildDefaultToolConfig().project, createMockPermissionManager()));
        expect(result.chronology).toMatchObject({ complete: false, scannedCount: 500, projectHead: null, workstreamHeads: [] });
        expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'event_chronology_truncated', status: 'invalid' })]));
        expect(result.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'project_state_lagging' })]));
        expect(result.localProbeBaseline).toMatchObject({ latestEventAt: null, latestHandoffAt: null, weakBaseline: true });
    });
});
