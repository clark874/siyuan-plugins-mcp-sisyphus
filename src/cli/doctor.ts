import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SiYuanClient } from '../api/client';
import { PERMISSIONS_API_PATH } from '../core/permissions';
import type { ParsedArgs } from './args';
import { loadFileConfig, resolveConfig } from './config';
import { probeMcpGateway, type DiagnosticCode, type McpProbeResult } from './mcp-probe';
import { REQUIRED_PLUGIN_MANIFEST_PATH, REQUIRED_PLUGIN_NAME } from './plugin-check';

export type DoctorClient = 'zcode' | 'kimi' | 'auto';

export interface DoctorCheck {
    name: 'kernel' | 'plugin' | 'gateway' | 'mcp' | 'client';
    status: 'ok' | 'failed' | 'not_checked';
    issue?: DiagnosticCode;
    detail?: string;
}

export interface DoctorReportInput {
    client: DoctorClient;
    checks: DoctorCheck[];
    issues: DiagnosticCode[];
    ready: boolean;
    mcp?: McpProbeResult;
}

export interface DoctorReport extends DoctorReportInput {
    schemaVersion: 1;
    status: 'ready' | 'degraded';
    access: {
        reads: 'direct_api';
        strictWrites: 'mcp_coordinator';
    };
    sessionMount: 'not_observable';
}

interface GatewaySettings {
    url: string;
    token?: string;
}

const HTTP_SETTINGS_API_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpHttpSettings';

export function buildDoctorReport(input: DoctorReportInput): DoctorReport {
    return {
        schemaVersion: 1,
        status: input.ready ? 'ready' : 'degraded',
        access: {
            reads: 'direct_api',
            strictWrites: 'mcp_coordinator',
        },
        sessionMount: 'not_observable',
        ...input,
        issues: [...new Set(input.issues)],
    };
}

function classifyKernelError(error: unknown): DiagnosticCode {
    const message = error instanceof Error ? error.message : String(error);
    return /HTTP error:\s*(401|403)\b|unauthorized|forbidden/i.test(message)
        ? 'kernel_unauthorized'
        : 'kernel_not_running';
}

function gatewaySettingsFromJson(raw: string): GatewaySettings | undefined {
    try {
        const settings = JSON.parse(raw) as Record<string, unknown>;
        if (settings.enabled === false) return undefined;
        const port = typeof settings.port === 'number' ? settings.port : 36806;
        const configuredHost = typeof settings.host === 'string' ? settings.host : '127.0.0.1';
        const host = configuredHost === '0.0.0.0' || configuredHost === '::' ? '127.0.0.1' : configuredHost;
        const protocol = settings.tlsEnabled === true ? 'https' : 'http';
        const token = settings.authEnabled === true && typeof settings.token === 'string' && settings.token
            ? settings.token
            : undefined;
        return { url: `${protocol}://${host}:${port}/mcp`, token };
    } catch {
        return undefined;
    }
}

function normalizeBearer(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const token = value.trim().replace(/^Bearer\s+/i, '');
    return token && !/\s/.test(token) ? token : undefined;
}

function readHostServer(client: Exclude<DoctorClient, 'auto'>): { url?: string; token?: string } | undefined {
    const candidates = client === 'kimi'
        ? [
            process.env.KIMI_CODE_HOME ? join(process.env.KIMI_CODE_HOME, 'mcp.json') : '',
            join(homedir(), '.kimi', 'mcp.json'),
            join(homedir(), '.kimi-code', 'mcp.json'),
        ].filter(Boolean)
        : [join(homedir(), '.zcode', 'cli', 'config.json')];
    for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        try {
            const config = JSON.parse(readFileSync(candidate, 'utf8')) as Record<string, any>;
            const server = config?.mcpServers?.siyuan
                ?? config?.mcpServers?.['siyuan-sisyphus']
                ?? config?.mcp?.servers?.siyuan
                ?? config?.mcp?.servers?.['siyuan-sisyphus'];
            if (server && typeof server === 'object') {
                return {
                    url: typeof server.url === 'string' ? server.url : undefined,
                    token: normalizeBearer(server.headers?.Authorization),
                };
            }
        } catch {
            return {};
        }
    }
    return undefined;
}

function checkHostConfiguration(client: DoctorClient, gateway: GatewaySettings): DoctorCheck {
    const clients: Array<Exclude<DoctorClient, 'auto'>> = client === 'auto' ? ['kimi', 'zcode'] : [client];
    const configured = clients.map((name) => ({ name, server: readHostServer(name) })).find(({ server }) => server !== undefined);
    if (!configured) {
        return { name: 'client', status: 'not_checked', detail: 'No selected client configuration was found.' };
    }
    const expectedUrl = gateway.url.replace(/\/$/, '');
    const actualUrl = configured.server?.url?.replace(/\/$/, '');
    const tokenMatches = !gateway.token || configured.server?.token === gateway.token;
    if (actualUrl !== expectedUrl || !tokenMatches) {
        return {
            name: 'client',
            status: 'failed',
            issue: 'host_reload_required',
            detail: `${configured.name} configuration does not match the active gateway; update it and reload the host.`,
        };
    }
    return {
        name: 'client',
        status: 'ok',
        detail: `${configured.name} configuration matches the active gateway; session mounting remains not observable from this process.`,
    };
}

export async function diagnoseConnectivity(cli: ParsedArgs): Promise<DoctorReport> {
    const selectedClient = cli.client ?? 'auto';
    const checks: DoctorCheck[] = [];
    const issues: DiagnosticCode[] = [];
    const resolved = resolveConfig(loadFileConfig(cli.configPath), {
        cliUrl: cli.url,
        cliToken: cli.token,
        profile: cli.profile,
    });
    const client = new SiYuanClient({ baseUrl: resolved.apiUrl, timeout: 2000 });
    if (resolved.token) client.setToken(resolved.token);

    try {
        await client.requestRead('/api/system/version');
        checks.push({ name: 'kernel', status: 'ok' });
    } catch (error) {
        const issue = classifyKernelError(error);
        issues.push(issue);
        checks.push({ name: 'kernel', status: 'failed', issue });
        return buildDoctorReport({ client: selectedClient, checks, issues, ready: false });
    }

    try {
        const manifest = JSON.parse(await client.readFile(REQUIRED_PLUGIN_MANIFEST_PATH)) as { name?: unknown };
        if (manifest.name !== REQUIRED_PLUGIN_NAME) throw new Error('manifest mismatch');
    } catch {
        issues.push('plugin_not_installed');
        checks.push({ name: 'plugin', status: 'failed', issue: 'plugin_not_installed' });
        return buildDoctorReport({ client: selectedClient, checks, issues, ready: false });
    }

    try {
        await client.readFile(PERMISSIONS_API_PATH);
    } catch {
        issues.push('plugin_not_ready');
        checks.push({ name: 'plugin', status: 'failed', issue: 'plugin_not_ready' });
        return buildDoctorReport({ client: selectedClient, checks, issues, ready: false });
    }
    checks.push({ name: 'plugin', status: 'ok' });

    let gateway: GatewaySettings | undefined;
    try {
        gateway = gatewaySettingsFromJson(await client.readFile(HTTP_SETTINGS_API_PATH));
    } catch {
        gateway = undefined;
    }
    if (!gateway) {
        issues.push('gateway_not_running');
        checks.push({ name: 'gateway', status: 'failed', issue: 'gateway_not_running' });
        return buildDoctorReport({ client: selectedClient, checks, issues, ready: false });
    }

    const mcp = await probeMcpGateway({ url: gateway.url, token: gateway.token, timeoutMs: 3000 });
    if (!mcp.ready && mcp.issue) issues.push(mcp.issue);
    checks.push({
        name: 'gateway',
        status: mcp.initialized ? 'ok' : 'failed',
        issue: !mcp.initialized ? mcp.issue : undefined,
    });
    checks.push({ name: 'mcp', status: mcp.ready ? 'ok' : 'failed', issue: mcp.issue });

    const hostCheck = checkHostConfiguration(selectedClient, gateway);
    checks.push(hostCheck);
    if (hostCheck.issue) issues.push(hostCheck.issue);

    return buildDoctorReport({
        client: selectedClient,
        checks,
        issues,
        ready: mcp.ready && hostCheck.status !== 'failed',
        mcp,
    });
}

function renderHumanReport(report: DoctorReport): string {
    const lines = [
        `Sisyphus doctor: ${report.status}`,
        'CLI reads: direct SiYuan API',
        'Strict writes: MCP coordinator',
        'Host session mount: not_observable',
    ];
    for (const check of report.checks) {
        lines.push(`- ${check.name}: ${check.status}${check.issue ? ` (${check.issue})` : ''}`);
        if (check.detail) lines.push(`  ${check.detail}`);
    }
    return `${lines.join('\n')}\n`;
}

export async function runDoctor(cli: ParsedArgs): Promise<number> {
    const report = await diagnoseConnectivity(cli);
    process.stdout.write(cli.json ? `${JSON.stringify(report)}\n` : renderHumanReport(report));
    return cli.requireReady && !report.ready ? 1 : 0;
}
