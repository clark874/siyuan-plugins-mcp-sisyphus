import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig, isDangerousAction } from '@/core/config';
import { callSystemTool, listSystemTools, SYSTEM_VARIANTS } from '@/tools/system';
import { parseResult } from '../../helpers/parse-result';
import { createMockClient } from '../../helpers/mock-client';

describe('system tool schemas', () => {
    it('derives constrained config and notification schemas from Zod', () => {
        const conf = SYSTEM_VARIANTS.find((variant) => variant.action === 'conf');
        const notify = SYSTEM_VARIANTS.find((variant) => variant.action === 'notify');
        const changelog = SYSTEM_VARIANTS.find((variant) => variant.action === 'changelog');
        const performSync = SYSTEM_VARIANTS.find((variant) => variant.action === 'perform_sync');
        const listPackages = SYSTEM_VARIANTS.find((variant) => variant.action === 'list_packages');
        const planChange = SYSTEM_VARIANTS.find((variant) => variant.action === 'plan_change');
        const applyChange = SYSTEM_VARIANTS.find((variant) => variant.action === 'apply_change');

        expect(conf?.schema.properties?.mode?.enum).toEqual(['summary', 'get']);
        expect(conf?.schema.properties?.maxDepth?.type).toBe('integer');
        expect(conf?.schema.properties?.maxDepth?.minimum).toBe(0);
        expect(conf?.schema.properties?.maxDepth?.maximum).toBe(5);
        expect(conf?.schema.properties?.maxItems?.minimum).toBe(1);
        expect(conf?.schema.properties?.maxItems?.maximum).toBe(100);
        expect(notify?.schema.required).toEqual(['action', 'msg', 'level']);
        expect(notify?.schema.properties?.level?.enum).toEqual(['info', 'error']);
        expect(changelog?.schema.properties?.fromVersion?.type).toBe('string');
        expect(changelog?.schema.properties?.limit?.minimum).toBe(1);
        expect(changelog?.schema.properties?.limit?.maximum).toBe(50);
        expect(performSync?.schema.required).toEqual(['action']);
        expect(performSync?.schema.additionalProperties).toBe(false);
        expect(listPackages?.schema.required).toEqual(['action', 'kind']);
        expect(listPackages?.schema.properties?.kind?.enum).toEqual(['plugin', 'widget', 'theme', 'icon', 'template']);
        expect(listPackages?.schema.properties?.page?.minimum).toBe(1);
        expect(listPackages?.schema.properties?.pageSize?.maximum).toBe(100);
        expect(planChange?.schema.required).toEqual(['action', 'change']);
        expect(applyChange?.schema.required).toEqual(['action', 'planID']);
    });

    it('keeps perform_sync enabled by default and marked high-risk', () => {
        const config = buildDefaultToolConfig().system;

        expect(config.actions.perform_sync).toBe(true);
        expect(isDangerousAction('system', 'perform_sync')).toBe(true);
        expect(config.actions.plan_change).toBe(true);
        expect(isDangerousAction('system', 'plan_change')).toBe(false);
        expect(isDangerousAction('system', 'apply_change')).toBe(true);
        expect(isDangerousAction('system', 'rollback_change')).toBe(true);
    });

    it('publishes typed system parameters plus strict internal branches', () => {
        const [tool] = listSystemTools(buildDefaultToolConfig().system);
        const schema = tool.inputSchema;
        const notifyBranch = schema['x-sisyphus-actionSchemas']?.find((branch) => branch.properties?.action?.const === 'notify');

        expect(schema.properties?.msg).toBeDefined();
        expect(schema.properties?.msg?.type).toBe('string');
        expect(schema.properties?.timeout?.type).toBe('number');
        expect(notifyBranch?.properties?.msg?.description).toBe('Message content');
        expect(notifyBranch?.properties?.level?.enum).toEqual(['info', 'error']);
        expect(notifyBranch?.additionalProperties).toBe(false);
    });

    it('returns structured changelog entries with personalization review hints', async () => {
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool({} as never, { action: 'changelog', fromVersion: '0.4.8' }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed.source).toBe('bundled CHANGELOG.md');
        expect(parsed.resource).toBe('siyuan://help/changelog');
        expect(parsed.entries.length).toBeGreaterThan(0);
        expect(parsed.entries[0].version).toMatch(/^\d+\.\d+\.\d+/);
        expect(parsed.personalizationReview).toEqual(expect.objectContaining({
            shouldReview: expect.any(Boolean),
            affectedVersions: expect.any(Array),
            affectedAreas: expect.any(Array),
        }));
    });

    it('returns a compact, paginated installed-package list', async () => {
        const client = createMockClient({
            request: vi.fn().mockResolvedValueOnce({
                packages: [
                    {
                        name: 'demo-plugin',
                        preferredName: 'Demo Plugin',
                        preferredDesc: 'A demo plugin',
                        version: '1.2.3',
                        author: 'Tester',
                        enabled: true,
                        installedIncompatible: false,
                        outdated: true,
                        repoURL: 'https://github.com/example/demo-plugin',
                        preferredReadme: 'must not be returned',
                    },
                    {
                        name: 'disabled-plugin',
                        preferredName: 'Disabled Plugin',
                        version: '1.0.0',
                        installedIncompatible: false,
                        outdated: false,
                    },
                ],
            }),
        });
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool(client, {
            action: 'list_packages',
            kind: 'plugin',
            page: 1,
            pageSize: 20,
        }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed).toEqual(expect.objectContaining({
            kind: 'plugin',
            total: 2,
            page: 1,
            pageSize: 20,
            pageCount: 1,
            items: [expect.objectContaining({
                name: 'demo-plugin',
                displayName: 'Demo Plugin',
                version: '1.2.3',
                enabled: true,
                compatible: true,
                outdated: true,
            }), expect.objectContaining({
                name: 'disabled-plugin',
                enabled: false,
            })],
        }));
        expect(parsed.items[0]).not.toHaveProperty('preferredReadme');
        expect(parsed.items[1]).toEqual(expect.objectContaining({
            name: 'disabled-plugin',
            enabled: false,
        }));
        expect(client.request).toHaveBeenCalledWith('/api/bazaar/getInstalledPlugin', {
            frontend: 'desktop',
            keyword: '',
        });
    });

    it('returns a read-only environment summary without plugin configuration content', async () => {
        const request = vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/system/version') return '3.7.3';
            if (endpoint === '/api/system/getConf') return { conf: { appearance: { mode: 0 } }, readonly: false };
            if (endpoint === '/api/bazaar/getInstalledPlugin') {
                return {
                    packages: [
                        { name: 'enabled', enabled: true, installedIncompatible: false, outdated: false },
                        { name: 'disabled', enabled: false, installedIncompatible: true, outdated: true },
                        { name: 'omitted-enabled-means-disabled', installedIncompatible: false, outdated: false },
                    ],
                };
            }
            return { packages: [] };
        });
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool(createMockClient({ request }), {
            action: 'audit_environment',
        }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed).toEqual(expect.objectContaining({
            readonly: true,
            version: '3.7.3',
            frontend: 'desktop',
            configuration: expect.objectContaining({
                totalTopLevelKeys: 2,
            }),
            packages: expect.objectContaining({
                totals: {
                    plugin: 3,
                    widget: 0,
                    theme: 0,
                    icon: 0,
                    template: 0,
                },
                plugins: {
                    enabled: 1,
                    disabled: 2,
                    incompatible: 1,
                    outdated: 1,
                },
            }),
        }));
        expect(JSON.stringify(parsed)).not.toContain('pluginStorage');
        expect(JSON.stringify(parsed)).not.toContain('configContent');
    });
});
