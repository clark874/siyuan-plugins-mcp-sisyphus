export const TELEMETRY_CONFIG_STORAGE_KEY = 'telemetryConfig';
export const TELEMETRY_CONFIG_PATH = `/data/storage/petal/siyuan-plugins-mcp-sisyphus/${TELEMETRY_CONFIG_STORAGE_KEY}`;

export interface TelemetryConfig {
    enabled: boolean;
    lastReportAt: number;
    reportIntervalHours: number;
    endpoint?: string;
}

export function buildDefaultTelemetryConfig(): TelemetryConfig {
    return {
        enabled: false,
        lastReportAt: 0,
        reportIntervalHours: 24,
    };
}

export function normalizeTelemetryConfig(raw: unknown): TelemetryConfig {
    const defaults = buildDefaultTelemetryConfig();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return defaults;
    }

    const record = raw as Record<string, unknown>;
    const reportIntervalHours = typeof record.reportIntervalHours === 'number' && Number.isFinite(record.reportIntervalHours)
        ? Math.max(1, Math.min(168, Math.floor(record.reportIntervalHours)))
        : defaults.reportIntervalHours;
    const endpoint = typeof record.endpoint === 'string' && record.endpoint.trim().length > 0
        ? record.endpoint.trim()
        : undefined;

    return {
        enabled: typeof record.enabled === 'boolean' ? record.enabled : defaults.enabled,
        lastReportAt: typeof record.lastReportAt === 'number' && Number.isFinite(record.lastReportAt)
            ? Math.max(0, record.lastReportAt)
            : defaults.lastReportAt,
        reportIntervalHours,
        endpoint,
    };
}
