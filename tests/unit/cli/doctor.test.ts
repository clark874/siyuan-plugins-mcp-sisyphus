import { describe, expect, it, vi } from 'vitest';

import {
    probeMcpGateway,
    type McpProbeSession,
} from '@/cli/mcp-probe';
import { buildDoctorReport } from '@/cli/doctor';

function session(overrides: Partial<McpProbeSession> = {}): McpProbeSession {
    return {
        initialize: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue(['system', 'fs']),
        bootstrap: vi.fn().mockResolvedValue({
            schemaVersion: 3,
            bootstrap: true,
            toolConfiguration: { current: true },
        }),
        close: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('MCP connectivity probe', () => {
    it('uses initialize, tools/list, and system.bootstrap before reporting ready', async () => {
        const probeSession = session();
        const result = await probeMcpGateway({
            url: 'http://127.0.0.1:36806/mcp',
            token: 'do-not-print-this-token',
        }, { createSession: () => probeSession });

        expect(probeSession.initialize).toHaveBeenCalledOnce();
        expect(probeSession.listTools).toHaveBeenCalledOnce();
        expect(probeSession.bootstrap).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ ready: true, issue: undefined });
        expect(JSON.stringify(result)).not.toContain('do-not-print-this-token');
    });

    it.each([
        'mcp_initialize_failed',
        'tools_list_failed',
        'bootstrap_failed',
    ] as const)('classifies %s without leaking credentials', async (issue) => {
        const overrides: Partial<McpProbeSession> = issue === 'mcp_initialize_failed'
            ? { initialize: vi.fn().mockRejectedValue(new Error('bad initialize')) }
            : issue === 'tools_list_failed'
                ? { listTools: vi.fn().mockRejectedValue(new Error('bad list')) }
                : { bootstrap: vi.fn().mockRejectedValue(new Error('bad bootstrap')) };
        const result = await probeMcpGateway({
            url: 'http://127.0.0.1:36806/mcp',
            token: 'secret-token-value',
        }, { createSession: () => session(overrides) });

        expect(result.issue).toBe(issue);
        expect(JSON.stringify(result)).not.toContain('secret-token-value');
    });

    it('classifies missing required tools, stale tool configuration, and schema mismatch', async () => {
        const missing = await probeMcpGateway({ url: 'http://127.0.0.1:36806/mcp' }, {
            createSession: () => session({ listTools: vi.fn().mockResolvedValue(['fs']) }),
        });
        const stale = await probeMcpGateway({ url: 'http://127.0.0.1:36806/mcp' }, {
            createSession: () => session({
                bootstrap: vi.fn().mockResolvedValue({ schemaVersion: 2, bootstrap: true, toolConfiguration: { current: false } }),
            }),
        });
        const mismatch = await probeMcpGateway({ url: 'http://127.0.0.1:36806/mcp' }, {
            createSession: () => session({ bootstrap: vi.fn().mockResolvedValue({ schemaVersion: 1 }) }),
        });

        expect(missing.issue).toBe('required_tool_missing');
        expect(stale.issue).toBe('tool_configuration_stale');
        expect(mismatch.issue).toBe('bootstrap_schema_mismatch');
    });

    it('区分网关超时与连接被拒绝', async () => {
        const url = 'http://127.0.0.1:36806/mcp';
        const timeout = await probeMcpGateway({ url }, {
            createSession: () => session({ bootstrap: vi.fn().mockRejectedValue(new Error('Request timed out')) }),
        });
        const refused = await probeMcpGateway({ url }, {
            createSession: () => session({ initialize: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }),
        });
        expect(timeout).toMatchObject({ initialized: true, issue: 'gateway_timeout' });
        expect(refused).toMatchObject({ initialized: false, issue: 'gateway_not_running' });
    });
});

describe('doctor report contract', () => {
    it('states direct reads, coordinated strict writes, and non-observable host session mounts', () => {
        const report = buildDoctorReport({
            client: 'zcode',
            checks: [],
            issues: ['host_reload_required'],
            ready: false,
        });

        expect(report.access).toEqual({
            reads: 'direct_api',
            strictWrites: 'mcp_coordinator',
        });
        expect(report.sessionMount).toBe('not_observable');
        expect(report.issues).toContain('host_reload_required');
    });
});
