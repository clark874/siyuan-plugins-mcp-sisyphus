import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig, isDangerousAction } from '@/core/config';
import { callSystemTool, listSystemTools, SYSTEM_VARIANTS } from '@/tools/system';
import { parseResult } from '../../helpers/parse-result';
import { createMockClient } from '../../helpers/mock-client';

describe('system tool schemas', () => {
    it('validates a frozen source-audit handoff without reading local source trees', async () => {
        const result = await callSystemTool(createMockClient(), {
            action: 'validate_source_audit',
            inventory: {
                schemaVersion: 1,
                items: [{
                    id: 'change-1', file: 'src/example.py', symbol: 'run', lineStart: 1, lineEnd: 4,
                    beforeBehavior: 'old', afterBehavior: 'new', risk: 'medium', evidenceHash: 'a'.repeat(64),
                }],
            },
            usageMap: {
                schemaVersion: 1,
                projects: [{ id: 'project-1', name: 'Project 1', usages: [{ inventoryId: 'change-1', status: 'used', evidence: ['main.py:10'] }] }],
            },
            baselinesMarkdown: `commit ${'b'.repeat(40)}\nsha256 ${'c'.repeat(64)}`,
        }, buildDefaultToolConfig().system, {} as never);

        expect(parseResult(result)).toMatchObject({ valid: true, summary: { inventoryItems: 1, projects: 1 } });
    });

    it('derives constrained config and notification schemas from Zod', () => {
        const conf = SYSTEM_VARIANTS.find((variant) => variant.action === 'conf');
        const notify = SYSTEM_VARIANTS.find((variant) => variant.action === 'notify');
        const changelog = SYSTEM_VARIANTS.find((variant) => variant.action === 'changelog');
        const performSync = SYSTEM_VARIANTS.find((variant) => variant.action === 'perform_sync');
        const listPackages = SYSTEM_VARIANTS.find((variant) => variant.action === 'list_packages');
        const searchBazaar = SYSTEM_VARIANTS.find((variant) => variant.action === 'search_bazaar');
        const getBazaarPackage = SYSTEM_VARIANTS.find((variant) => variant.action === 'get_bazaar_package');
        const readBazaarReadme = SYSTEM_VARIANTS.find((variant) => variant.action === 'read_bazaar_readme');
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
        expect(searchBazaar?.schema.required).toEqual(['action', 'kind']);
        expect(searchBazaar?.schema.properties?.installation?.enum).toEqual(['all', 'installed', 'not_installed']);
        expect(searchBazaar?.schema.properties?.sortBy?.enum).toEqual(['downloads', 'stars', 'updated', 'name']);
        expect(getBazaarPackage?.schema.required).toEqual(['action', 'kind', 'packageName']);
        expect(readBazaarReadme?.schema.required).toEqual(['action', 'kind', 'packageName']);
        expect(readBazaarReadme?.schema.properties?.maxChars?.maximum).toBe(32000);
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

    it('searches the online bazaar with installation filters, stable sorting, and pagination', async () => {
        const client = createMockClient({
            request: vi.fn().mockResolvedValueOnce({
                packages: [
                    { name: 'installed-low', preferredName: 'Installed Low', installed: true, downloads: 5, stars: 2, bazaarIncompatible: false },
                    { name: 'new-high', preferredName: 'New High', preferredDesc: '<strong>Popular</strong> &amp; useful', installed: false, downloads: 200, stars: 10, bazaarIncompatible: false },
                    { name: 'new-mid', preferredName: 'New Mid', installed: false, downloads: 100, stars: 50, bazaarIncompatible: false },
                ],
            }),
        });
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool(client, {
            action: 'search_bazaar',
            kind: 'plugin',
            installation: 'not_installed',
            sortBy: 'downloads',
            sortOrder: 'desc',
            page: 1,
            pageSize: 1,
        }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed).toEqual(expect.objectContaining({
            readonly: true,
            kind: 'plugin',
            total: 2,
            page: 1,
            pageSize: 1,
            pageCount: 2,
            hasMore: true,
            items: [expect.objectContaining({ name: 'new-high', description: 'Popular & useful', downloads: 200, installed: false })],
        }));
        expect(client.request).toHaveBeenCalledWith('/api/bazaar/getBazaarPlugin', {
            frontend: 'desktop',
            keyword: '',
        });
    });

    it('excludes packages that SiYuan disallows even when bazaarIncompatible is false', async () => {
        const client = createMockClient({
            request: vi.fn().mockResolvedValueOnce({
                packages: [
                    { name: 'usable', installed: false, bazaarIncompatible: false, disallowInstall: false },
                    { name: 'requires-newer-siyuan', installed: false, bazaarIncompatible: false, disallowInstall: true },
                ],
            }),
        });
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool(client, {
            action: 'search_bazaar',
            kind: 'plugin',
            installation: 'not_installed',
            compatibility: 'compatible',
        }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed.total).toBe(1);
        expect(parsed.items).toEqual([expect.objectContaining({
            name: 'usable',
            compatible: true,
            installAllowed: true,
        })]);
    });

    it('returns exact bazaar metadata together with local installed state', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce({
                packages: [{
                    name: 'demo-plugin', preferredName: 'Demo Plugin', version: '2.0.0', repoURL: 'https://github.com/example/demo',
                    repoHash: 'abcdef1', installed: true, outdated: true, downloads: 99, bazaarIncompatible: false,
                }],
            })
            .mockResolvedValueOnce({
                packages: [{ name: 'demo-plugin', version: '1.0.0', enabled: true, installedIncompatible: false }],
            });
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool(createMockClient({ request }), {
            action: 'get_bazaar_package',
            kind: 'plugin',
            packageName: 'demo-plugin',
        }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed.package).toEqual(expect.objectContaining({
            name: 'demo-plugin',
            version: '2.0.0',
            repositoryHash: 'abcdef1',
            installed: true,
            outdated: true,
        }));
        expect(parsed.local).toEqual(expect.objectContaining({
            version: '1.0.0',
            enabled: true,
        }));
    });

    it('returns a sanitized, redacted, truncated README for an exact bazaar package', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce({
                packages: [{ name: 'demo-plugin', preferredName: 'Demo Plugin', repoURL: 'https://github.com/example/demo', repoHash: 'abcdef1' }],
            })
            .mockResolvedValueOnce({
                html: '<h1>Demo &amp; Test</h1><script>alert(1)</script><p>token=abcdefghijklmnop</p><p>Long content</p>',
            });
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool(createMockClient({ request }), {
            action: 'read_bazaar_readme',
            kind: 'plugin',
            packageName: 'demo-plugin',
            maxChars: 24,
        }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed).toEqual(expect.objectContaining({
            readonly: true,
            untrustedContent: true,
            package: expect.objectContaining({ name: 'demo-plugin' }),
            sourceFormat: 'html',
            outputFormat: 'plain_text',
            redacted: true,
            truncated: true,
            contentHash: expect.stringMatching(/^sha256:/),
        }));
        expect(parsed.content).toContain('Demo & Test');
        expect(parsed.content).not.toContain('<script>');
        expect(parsed.content).not.toContain('alert(1)');
        expect(parsed.content).not.toContain('abcdefghijklmnop');
        expect(parsed.hints[0]).toContain('untrusted third-party content');
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

    it('returns a live one-call onboarding payload without mislabeling the whole connection as read-only', async () => {
        const toolConfig = buildDefaultToolConfig();
        toolConfig.fs.enabled = false;
        toolConfig.search.actions.query_sql = false;
        const request = vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/system/version') return '3.7.3';
            if (endpoint === '/api/notebook/lsNotebooks') {
                return {
                    notebooks: [
                        { id: 'nb-open', name: '工作日志', closed: false, icon: '', sort: 0 },
                        { id: 'nb-private', name: '私密库', closed: false, icon: '', sort: 1 },
                    ],
                };
            }
            return {};
        });
        const readFile = vi.fn().mockResolvedValue(JSON.stringify(toolConfig));
        const config = buildDefaultToolConfig().system;
        const reload = vi.fn().mockResolvedValue(undefined);
        const permMgr = {
            reload,
            get: (id: string) => (id === 'nb-open' ? 'rwd' : 'none'),
        } as never;
        const result = await callSystemTool(createMockClient({ request, readFile }), {
            action: 'bootstrap',
        }, config, permMgr);
        const parsed = parseResult(result);

        expect(parsed).toEqual(expect.objectContaining({
            schemaVersion: 2,
            bootstrap: true,
            version: '3.7.3',
            operation: {
                action: 'system.bootstrap',
                readOnly: true,
            },
            connection: {
                access: 'permission-controlled',
                readableNotebookCount: 1,
                writableNotebookCount: 1,
                deletableNotebookCount: 1,
            },
        }));
        expect(parsed).not.toHaveProperty('readonly');
        expect(reload).toHaveBeenCalledOnce();
        expect(parsed.notebooks).toEqual([
            expect.objectContaining({
                id: 'nb-open',
                name: '工作日志',
                closed: false,
                permission: 'rwd',
                readable: true,
                writable: true,
                deletable: true,
            }),
        ]);
        expect(parsed.restrictedNotebookCount).toBe(1);
        expect(JSON.stringify(parsed)).not.toContain('私密库');
        expect(parsed.capabilities).toEqual(expect.objectContaining({
            fs: expect.objectContaining({ enabled: false }),
            search: expect.objectContaining({
                enabled: true,
                actions: expect.objectContaining({ fulltext: true, query_sql: false }),
            }),
            av: expect.objectContaining({ enabled: true }),
            timeline: expect.objectContaining({ enabled: true }),
            pluginStorage: expect.objectContaining({
                mode: 'controlled-redacted-read',
                actions: expect.objectContaining({
                    list_plugin_storage: true,
                    read_plugin_storage: true,
                    inspect_plugin: true,
                }),
            }),
        }));
        expect(parsed.toolConfiguration).toEqual({ current: true, source: 'api_file' });
        expect(parsed.writeSafety).toEqual(expect.objectContaining({
            strictMode: true,
            protocol: 'preflight-lease-v1',
            mutationSteps: [
                expect.stringContaining('validateOnly=true'),
                expect.stringContaining('expectedStateHash'),
            ],
        }));
        expect(parsed.nextCalls).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ tool: 'notebook', action: 'list' }),
            expect.objectContaining({ tool: 'fs' }),
            expect.objectContaining({ tool: 'search', action: 'query_sql' }),
        ]));
        expect(parsed.nextCalls).toEqual(expect.arrayContaining([
            expect.objectContaining({ tool: 'search', action: 'fulltext' }),
            expect.objectContaining({ tool: 'timeline', action: 'list_nodes' }),
        ]));
        expect(parsed.nextCalls.length).toBeGreaterThan(0);
        expect(parsed.skills.length).toBeGreaterThan(0);
        expect(parsed.hints.length).toBeGreaterThan(0);
    });

    it('points bootstrap at the workspace memory before any browsing call when the memory exists', async () => {
        const toolConfig = buildDefaultToolConfig();
        toolConfig.agentSiyuanMemoryText = '# 工作区记忆\n\n开工先查库。';
        toolConfig.agentSiyuanMemoryUpdatedAt = new Date().toISOString();
        const request = vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/system/version') return '3.7.3';
            if (endpoint === '/api/notebook/lsNotebooks') {
                return { notebooks: [{ id: 'nb-open', name: '工作日志', closed: false, icon: '', sort: 0 }] };
            }
            return {};
        });
        const permMgr = {
            reload: vi.fn().mockResolvedValue(undefined),
            get: () => 'rwd',
        } as never;

        const result = await callSystemTool(
            createMockClient({ request, readFile: vi.fn().mockResolvedValue(JSON.stringify(toolConfig)) }),
            { action: 'bootstrap' },
            buildDefaultToolConfig().system,
            permMgr,
        );
        const parsed = parseResult(result);

        expect(parsed.memory).toEqual(expect.objectContaining({ path: '/AGENTS.md', status: 'fresh' }));
        expect(parsed.memory).toEqual(expect.objectContaining({
            freshnessBasis: 'saved timestamp only',
            contentVerified: false,
        }));
        expect(parsed.nextCalls[0]).toEqual(expect.objectContaining({
            tool: 'fs',
            action: 'read',
            args: { path: '/AGENTS.md' },
        }));
        expect(parsed.hints).toEqual(expect.arrayContaining([expect.stringContaining('/AGENTS.md')]));
        expect(parsed.hints).toEqual(expect.arrayContaining([expect.stringContaining('timestamp-based only')]));
    });

    it('does not send bootstrap to read a workspace memory that was never created', async () => {
        const request = vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/system/version') return '3.7.3';
            if (endpoint === '/api/notebook/lsNotebooks') {
                return { notebooks: [{ id: 'nb-open', name: '工作日志', closed: false, icon: '', sort: 0 }] };
            }
            return {};
        });
        const permMgr = {
            reload: vi.fn().mockResolvedValue(undefined),
            get: () => 'rwd',
        } as never;

        const result = await callSystemTool(
            createMockClient({ request, readFile: vi.fn().mockResolvedValue(JSON.stringify(buildDefaultToolConfig())) }),
            { action: 'bootstrap' },
            buildDefaultToolConfig().system,
            permMgr,
        );
        const parsed = parseResult(result);

        expect(parsed.memory.status).toBe('missing');
        expect(parsed.nextCalls).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ args: { path: '/AGENTS.md' } }),
        ]));
        expect(parsed.hints).toEqual(expect.arrayContaining([expect.stringContaining('No workspace memory')]));
    });

    it('marks bootstrap capability data as fallback when the live tool config cannot be read', async () => {
        const request = vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/system/version') return '3.7.3';
            if (endpoint === '/api/notebook/lsNotebooks') return { notebooks: [] };
            return {};
        });
        const readFile = vi.fn().mockRejectedValue(new Error('offline'));
        const permMgr = {
            reload: vi.fn().mockResolvedValue(undefined),
            get: vi.fn(),
        } as never;

        const result = await callSystemTool(createMockClient({ request, readFile }), {
            action: 'bootstrap',
        }, buildDefaultToolConfig().system, permMgr);
        const parsed = parseResult(result);

        expect(parsed.toolConfiguration).toEqual({ current: false, source: 'default_fallback' });
        expect(parsed.hints).toEqual(expect.arrayContaining([
            expect.stringContaining('fallback'),
        ]));
    });
});
