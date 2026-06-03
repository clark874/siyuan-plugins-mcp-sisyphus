<script lang="ts">
    import { onMount } from "svelte";
    import { fetchPost, showMessage } from "siyuan";

    import SettingPanel from "../../shared/setting-panel.svelte";
    import type { ToolConfig } from "../tool-config";
    import type { TelemetryConfig } from "../tool-config-storage";

    export let analyticsGroup: string;
    export let analyticsDisplay = true;
    export let telemetryGroup: string;
    export let telemetryDisplay = true;
    export let showTelemetry = true;
    export let telemetryConfig: TelemetryConfig;
    export let currentToolConfig: ToolConfig;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    let analyticsSummary: any = null;
    let recentAnalyticsEvents: any[] = [];
    let analyticsLoading = false;
    let analyticsError = "";
    let telemetryItems: ISettingItem[] = [];
    let telemetryPreviewJson = "";

    function buildTelemetryItems(
        currentTelemetryConfig: TelemetryConfig,
        label: (key: string, fallback: string) => string,
    ): ISettingItem[] {
        return [
            {
                type: "checkbox",
                key: "telemetry__enabled",
                value: currentTelemetryConfig.enabled,
                title: label("telemetry_enabled_title", "Enable Anonymous Telemetry"),
                description: label("telemetry_enabled_desc", "Send aggregated usage statistics to help improve the MCP plugin. No note content, IDs, or paths are ever uploaded."),
            },
            {
                type: "select",
                key: "telemetry__interval",
                value: String(currentTelemetryConfig.reportIntervalHours),
                title: label("telemetry_interval_title", "Report Interval"),
                description: label("telemetry_interval_desc", "How often to send a telemetry report."),
                options: {
                    "12": label("telemetry_interval_option_12", "12 hours"),
                    "24": label("telemetry_interval_option_24", "24 hours"),
                    "72": label("telemetry_interval_option_72", "72 hours"),
                },
            },
            {
                type: "text",
                key: "telemetry__endpoint",
                value: currentTelemetryConfig.endpoint ?? "",
                title: label("telemetry_endpoint_title", "Telemetry Endpoint"),
                description: label("telemetry_endpoint_desc", "Optional HTTPS endpoint for aggregated telemetry. Leave empty to disable all telemetry uploads."),
                placeholder: "https://example.com/v1/collect",
            },
        ];
    }

    async function loadAnalyticsSummary() {
        analyticsLoading = true;
        analyticsError = "";
        try {
            const { readAnalyticsEvents, computeAnalyticsSummary, getRecentAnalyticsEvents } = await import("../../../core/analytics");
            const events = await readAnalyticsEvents({
                readFile: async (path: string) => {
                    return new Promise<string>((resolve, reject) => {
                        fetchPost("/api/file/getFile", { path }, (resp: any) => {
                            if (typeof resp === "string") {
                                resolve(resp);
                            } else if (resp?.data && typeof resp.data === "string") {
                                resolve(resp.data);
                            } else {
                                // getFile returns raw text on success; on failure resp may have code !== 0
                                reject(new Error("Failed to read file"));
                            }
                        });
                    });
                },
                writeFile: async () => { /* not used in read path */ },
                request: async () => { throw new Error("not implemented"); },
                readFileBinary: async () => { throw new Error("not implemented"); },
                getBaseUrl: () => "",
                getAuthHeaders: () => ({}),
                setToken: () => {},
            } as any, Number.POSITIVE_INFINITY);
            const summaryCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            analyticsSummary = computeAnalyticsSummary(events.filter((event: any) => event.ts >= summaryCutoff), { currentToolConfig });
            recentAnalyticsEvents = getRecentAnalyticsEvents(events, 100);
        } catch (e) {
            analyticsError = e instanceof Error ? e.message : String(e);
            analyticsSummary = null;
            recentAnalyticsEvents = [];
        } finally {
            analyticsLoading = false;
        }
    }

    async function clearAnalyticsData() {
        try {
            const { ANALYTICS_PATH, ANALYTICS_ROTATED_PATH } = await import("../../../core/analytics");
            const clearFile = async (path: string) => {
                const formData = new FormData();
                formData.append("path", path);
                formData.append("isDir", "false");
                formData.append("modTime", String(Date.now()));
                formData.append("file", new File([""], "empty"));
                return new Promise<void>((resolve, reject) => {
                    fetchPost("/api/file/putFile", formData, (resp: any) => {
                        if (resp?.code === 0) resolve(); else reject();
                    });
                });
            };
            await Promise.all([clearFile(ANALYTICS_PATH), clearFile(ANALYTICS_ROTATED_PATH)]);
            showMessage(getLabel("analyticsCleared", "✅ Local analytics data cleared"));
            await loadAnalyticsSummary();
        } catch {
            showMessage(getLabel("analyticsClearFailed", "Failed to clear analytics data"));
        }
    }

    async function exportAnalyticsReport() {
        try {
            const { ANALYTICS_PATH, ANALYTICS_ROTATED_PATH, computeAnalyticsSummary, parseJsonl } = await import("../../../core/analytics");
            const readFile = (path: string): Promise<string> => new Promise((resolve, reject) => {
                fetchPost("/api/file/getFile", { path }, (resp: any) => {
                    if (typeof resp === "string") resolve(resp);
                    else if (resp?.data && typeof resp.data === "string") resolve(resp.data);
                    else reject(new Error("Failed to read file"));
                });
            });
            const parts: string[] = [];
            try { parts.push(await readFile(ANALYTICS_PATH)); } catch { /* ignore */ }
            try { parts.push(await readFile(ANALYTICS_ROTATED_PATH)); } catch { /* ignore */ }
            const events = parseJsonl(parts.join("\n"));
            const summary = computeAnalyticsSummary(events, { currentToolConfig });
            const report = {
                generatedAt: new Date().toISOString(),
                summary,
                rawEventCount: events.length,
            };
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `siyuan-mcp-analytics-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showMessage(getLabel("analyticsExported", "✅ Analytics report exported"));
        } catch {
            showMessage(getLabel("analyticsExportFailed", "Failed to export analytics report"));
        }
    }

    async function buildTelemetryPreview() {
        try {
            const { buildTelemetryPayload } = await import("../../../core/telemetry");
            const client = {
                readFile: async (path: string) => {
                    return new Promise<string>((resolve, reject) => {
                        fetchPost("/api/file/getFile", { path }, (resp: any) => {
                            if (typeof resp === "string") resolve(resp);
                            else if (resp?.data && typeof resp.data === "string") resolve(resp.data);
                            else reject(new Error("Failed to read file"));
                        });
                    });
                },
                writeFile: async () => {},
                request: async () => { throw new Error("not implemented"); },
                readFileBinary: async () => { throw new Error("not implemented"); },
                getBaseUrl: () => "",
                getAuthHeaders: () => ({}),
                setToken: () => {},
            } as any;
            const payload = await buildTelemetryPayload(client, telemetryConfig.lastReportAt || Date.now() - telemetryConfig.reportIntervalHours * 60 * 60 * 1000);
            telemetryPreviewJson = payload ? JSON.stringify(payload, null, 2) : getLabel("telemetryPreviewEmpty", "No data to send yet.");
        } catch (e) {
            telemetryPreviewJson = e instanceof Error ? e.message : String(e);
        }
    }

    function formatTimestamp(ts: number) {
        if (!Number.isFinite(ts)) return "—";
        return new Date(ts).toLocaleString();
    }

    function formatApproxTokens(value: unknown) {
        return typeof value === "number" && Number.isFinite(value) ? `~${Math.round(value)}` : "—";
    }

    function formatChars(value: unknown) {
        return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
    }

    function formatDuration(value: unknown) {
        return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}ms` : "—";
    }

    function getCapturedText(value: unknown) {
        return typeof value === "string" && value.length > 0
            ? value
            : getLabel("analyticsRecentMissingText", "Not captured for this legacy event.");
    }

    async function writeClipboardText(text: string) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) {
            throw new Error("copy failed");
        }
    }

    async function copyRecentCall(event: any) {
        const payload = {
            tool: event.tool,
            action: event.action,
            status: event.status,
            timestamp: formatTimestamp(event.ts),
            timestampMs: event.ts,
            durationMs: event.durationMs,
            transport: event.transport,
            errorCode: event.errorCode,
            tokens: {
                inputApproxTokens: event.requestApproxTokens,
                outputApproxTokens: event.responseApproxTokens,
                totalApproxTokens: event.totalApproxTokens,
                inputChars: event.requestChars,
                outputChars: event.responseChars,
                tokenMode: event.tokenMode,
            },
            input: {
                text: getCapturedText(event.requestText),
                truncated: Boolean(event.requestTextTruncated),
            },
            output: {
                text: getCapturedText(event.responseText),
                truncated: Boolean(event.responseTextTruncated),
            },
        };

        try {
            await writeClipboardText(JSON.stringify(payload, null, 2));
            showMessage(getLabel("analyticsRecentCopied", "Call details copied"));
        } catch {
            showMessage(getLabel("analyticsRecentCopyFailed", "Failed to copy call details"));
        }
    }

    onMount(loadAnalyticsSummary);

    $: if (currentToolConfig) {
        void loadAnalyticsSummary();
    }

    $: telemetryItems = buildTelemetryItems(telemetryConfig, getLabel);
</script>

<SettingPanel group={analyticsGroup} settingItems={[]} display={analyticsDisplay}>
    <div class="analytics-section">
        {#if analyticsLoading}
            <div class="analytics-hint">{getLabel("analyticsLoading", "Loading analytics...")}</div>
        {:else if analyticsError}
            <div class="analytics-hint analytics-hint--error">{analyticsError}</div>
        {:else}
            {#if !analyticsSummary || analyticsSummary.totalCalls === 0}
                <div class="analytics-hint">{getLabel("analyticsEmpty", "No analytics data yet. Start using MCP tools to see usage statistics.")}</div>
            {/if}

            <div class="analytics-grid">
                <div class="analytics-card">
                    <div class="analytics-card__value">{analyticsSummary?.totalCalls ?? 0}</div>
                    <div class="analytics-card__label">{getLabel("analyticsTotalCalls", "Total Calls")}</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card__value">
                        {#if analyticsSummary?.tokenUsage?.cliAvgApproxTokens != null}
                            ~{Math.round(analyticsSummary.tokenUsage.cliAvgApproxTokens)}
                        {:else}
                            —
                        {/if}
                    </div>
                    <div class="analytics-card__label">{getLabel("analyticsCliAvgTokens", "CLI Avg Tokens")}</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card__value">
                        {#if analyticsSummary?.tokenUsage?.mcpAvgApproxTokens != null}
                            ~{Math.round(analyticsSummary.tokenUsage.mcpAvgApproxTokens)}
                        {:else}
                            —
                        {/if}
                    </div>
                    <div class="analytics-card__label">{getLabel("analyticsMcpAvgTokens", "MCP Avg Tokens")}</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card__value">
                        {#if analyticsSummary?.tokenUsage?.mcpInitialApproxTokens != null}
                            ~{Math.round(analyticsSummary.tokenUsage.mcpInitialApproxTokens)}
                        {:else}
                            —
                        {/if}
                    </div>
                    <div class="analytics-card__label">{getLabel("analyticsMcpFirstConnect", "MCP First Connect")}</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card__value">{analyticsSummary?.errorCalls ?? 0}</div>
                    <div class="analytics-card__label">{getLabel("analyticsErrors", "Errors")}</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card__value">{(((analyticsSummary?.errorRate ?? 0) * 100).toFixed(1))}%</div>
                    <div class="analytics-card__label">{getLabel("analyticsErrorRate", "Error Rate")}</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card__value">{Math.round(analyticsSummary?.avgDurationMs ?? 0)}ms</div>
                    <div class="analytics-card__label">{getLabel("analyticsAvgDuration", "Avg Duration")}</div>
                </div>
            </div>

            <div class="analytics-block">
                <div class="analytics-block__title">{getLabel("analyticsTokenUsage", "Token Usage")}</div>
                <div class="analytics-list">
                    <div class="analytics-list__item">
                        <span class="analytics-list__name">{getLabel("analyticsCliAvgTokens", "CLI Avg Tokens")}</span>
                        <span class="analytics-list__count">
                            {#if analyticsSummary?.tokenUsage?.cliAvgApproxTokens != null}
                                ~{Math.round(analyticsSummary.tokenUsage.cliAvgApproxTokens)}
                            {:else}
                                —
                            {/if}
                        </span>
                        <span class="analytics-list__meta">
                            {#if analyticsSummary?.tokenUsage?.cliMeasuredCalls}
                                {analyticsSummary.tokenUsage.cliMeasuredCalls} {getLabel("analyticsCallCount", "call(s)")}
                            {/if}
                        </span>
                    </div>
                    <div class="analytics-list__item">
                        <span class="analytics-list__name">{getLabel("analyticsMcpAvgTokens", "MCP Avg Tokens")}</span>
                        <span class="analytics-list__count">
                            {#if analyticsSummary?.tokenUsage?.mcpAvgApproxTokens != null}
                                ~{Math.round(analyticsSummary.tokenUsage.mcpAvgApproxTokens)}
                            {:else}
                                —
                            {/if}
                        </span>
                        <span class="analytics-list__meta">
                            {#if analyticsSummary?.tokenUsage?.mcpMeasuredCalls}
                                {analyticsSummary.tokenUsage.mcpMeasuredCalls} {getLabel("analyticsCallCount", "call(s)")}
                            {/if}
                        </span>
                    </div>
                    <div class="analytics-list__item">
                        <span class="analytics-list__name">{getLabel("analyticsMcpFirstConnect", "MCP First Connect")}</span>
                        <span class="analytics-list__count">
                            {#if analyticsSummary?.tokenUsage?.mcpInitialApproxTokens != null}
                                ~{Math.round(analyticsSummary.tokenUsage.mcpInitialApproxTokens)}
                            {:else}
                                —
                            {/if}
                        </span>
                        <span class="analytics-list__meta">
                            {#if analyticsSummary?.tokenUsage?.mcpInitialChars != null}
                                {analyticsSummary.tokenUsage.mcpInitialChars} {getLabel("analyticsCharCount", "chars")}
                            {/if}
                        </span>
                    </div>
                </div>
                <div class="analytics-note">
                    {getLabel("analyticsTokenApproxHint", "Approximate token counts based on observed text length; MCP first-connection cost is shown separately from per-call averages.")}
                </div>
            </div>

            {#if analyticsSummary && analyticsSummary.topActions.length > 0}
                <div class="analytics-block">
                    <div class="analytics-block__title">{getLabel("analyticsTopActions", "Top Actions")}</div>
                    <div class="analytics-list">
                        {#each analyticsSummary.topActions as action}
                            <div class="analytics-list__item">
                                <span class="analytics-list__name">{action.tool}.{action.action}</span>
                                <span class="analytics-list__count">{action.count}</span>
                                <span class="analytics-list__meta">{action.errorCount > 0 ? `${action.errorCount} ${getLabel("analyticsErrorShort", "err")}` : ''} ~{Math.round(action.avgDurationMs)}ms</span>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if analyticsSummary && analyticsSummary.dailyTrend.length > 0}
                <div class="analytics-block">
                    <div class="analytics-block__title">{getLabel("analyticsDailyTrend", "Daily Trend (last 7 days)")}</div>
                    <div class="analytics-list">
                        {#each analyticsSummary.dailyTrend.slice(-7) as day}
                            <div class="analytics-list__item">
                                <span class="analytics-list__name">{day.date}</span>
                                <span class="analytics-list__count">{day.count}</span>
                                <span class="analytics-list__meta">{day.errorCount > 0 ? `${day.errorCount} ${getLabel("analyticsErrorShort", "err")}` : ''}</span>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <div class="analytics-block">
                <div class="analytics-block__title">{getLabel("analyticsTransport", "Invocation Source")}</div>
                <div class="analytics-list">
                    <div class="analytics-list__item">
                        <span class="analytics-list__name">{getLabel("analyticsSourceCli", "cli")}</span>
                        <span class="analytics-list__count">{analyticsSummary?.transportDistribution?.cli ?? 0}</span>
                    </div>
                    <div class="analytics-list__item">
                        <span class="analytics-list__name">{getLabel("analyticsSourceStdio", "stdio")}</span>
                        <span class="analytics-list__count">{analyticsSummary?.transportDistribution?.stdio ?? 0}</span>
                    </div>
                    <div class="analytics-list__item">
                        <span class="analytics-list__name">{getLabel("analyticsSourceHttp", "http")}</span>
                        <span class="analytics-list__count">{analyticsSummary?.transportDistribution?.http ?? 0}</span>
                    </div>
                </div>
            </div>

            {#if recentAnalyticsEvents.length > 0}
                <div class="analytics-block analytics-recent">
                    <div class="analytics-block__title">{getLabel("analyticsRecentCalls", "Recent Calls")}</div>
                    <div class="analytics-note">
                        {getLabel("analyticsRecentCallsHint", "Shows the latest 100 local calls with captured input/output text and approximate token counts.")}
                    </div>
                    <div class="analytics-recent__list">
                        {#each recentAnalyticsEvents as event}
                            <details class:eventError={event.status === "error"} class="analytics-call">
                                <summary class="analytics-call__summary">
                                    <span class="analytics-call__main">
                                        <span class="analytics-call__name">{event.tool}.{event.action}</span>
                                        <span class="analytics-call__time">{formatTimestamp(event.ts)}</span>
                                    </span>
                                    <span class="analytics-call__aside">
                                        <span class="analytics-call__meta">
                                            <span class="analytics-call__status">{event.status}</span>
                                            <span>{formatDuration(event.durationMs)}</span>
                                            <span>{formatApproxTokens(event.totalApproxTokens)}</span>
                                        </span>
                                        <button class="b3-button b3-button--outline analytics-call__copy" type="button" on:click|preventDefault|stopPropagation={() => copyRecentCall(event)}>
                                            {getLabel("analyticsRecentCopy", "Copy")}
                                        </button>
                                    </span>
                                </summary>
                                <div class="analytics-call__body">
                                    <div class="analytics-call__stats">
                                        <span>{getLabel("analyticsRecentInputTokens", "Input")} {formatApproxTokens(event.requestApproxTokens)} / {formatChars(event.requestChars)} {getLabel("analyticsCharCount", "chars")}</span>
                                        <span>{getLabel("analyticsRecentOutputTokens", "Output")} {formatApproxTokens(event.responseApproxTokens)} / {formatChars(event.responseChars)} {getLabel("analyticsCharCount", "chars")}</span>
                                        <span>{getLabel("analyticsRecentTotalTokens", "Total")} {formatApproxTokens(event.totalApproxTokens)}</span>
                                    </div>
                                    {#if event.errorCode}
                                        <div class="analytics-call__error">{event.errorCode}</div>
                                    {/if}
                                    <div class="analytics-call__columns">
                                        <div class="analytics-call__pane">
                                            <div class="analytics-call__pane-title">
                                                {getLabel("analyticsRecentInput", "Input")}
                                                {#if event.requestTextTruncated}
                                                    <span>{getLabel("analyticsRecentTruncated", "truncated")}</span>
                                                {/if}
                                            </div>
                                            <pre>{getCapturedText(event.requestText)}</pre>
                                        </div>
                                        <div class="analytics-call__pane">
                                            <div class="analytics-call__pane-title">
                                                {getLabel("analyticsRecentOutput", "Output")}
                                                {#if event.responseTextTruncated}
                                                    <span>{getLabel("analyticsRecentTruncated", "truncated")}</span>
                                                {/if}
                                            </div>
                                            <pre>{getCapturedText(event.responseText)}</pre>
                                        </div>
                                    </div>
                                </div>
                            </details>
                        {/each}
                    </div>
                </div>
            {/if}
        {/if}

        <div class="analytics-actions">
            <button class="b3-button b3-button--outline" on:click={loadAnalyticsSummary}>
                {getLabel("analyticsRefresh", "Refresh")}
            </button>
            <button class="b3-button b3-button--outline" on:click={exportAnalyticsReport} disabled={!analyticsSummary || analyticsSummary.totalCalls === 0}>
                {getLabel("analyticsExport", "Export Report")}
            </button>
            <button class="b3-button b3-button--outline" on:click={clearAnalyticsData}>
                {getLabel("analyticsClear", "Clear Data")}
            </button>
        </div>
    </div>
</SettingPanel>
{#if showTelemetry}
    <SettingPanel group={telemetryGroup} settingItems={telemetryItems} display={telemetryDisplay} on:changed={onChanged}>
        <div class="telemetry-section">
            <div class="telemetry-hint">
                {getLabel("telemetryHint", "Telemetry sends only aggregated statistics (call counts, error rates, average durations). No note content, IDs, or paths are ever included.")}
            </div>
            {#if telemetryConfig.enabled}
                <div class="telemetry-preview">
                    <button class="b3-button b3-button--outline" on:click={buildTelemetryPreview}>
                        {getLabel("telemetryPreview", "Preview data to send")}
                    </button>
                    {#if telemetryPreviewJson}
                        <pre class="telemetry-preview__code">{telemetryPreviewJson}</pre>
                    {/if}
                </div>
            {/if}
        </div>
    </SettingPanel>
{/if}

<style lang="scss">
    .analytics-section {
        display: flex;
        flex-direction: column;
        gap: var(--mcp-config-section-gap, 14px);
        font-size: 13px;
    }

    .analytics-hint {
        padding: var(--mcp-config-card-padding, 16px);
        background: transparent;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--mcp-config-card-radius, 8px);
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
    }

    .analytics-hint--error {
        color: var(--b3-theme-error);
    }

    .analytics-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
    }

    .analytics-card {
        background: transparent;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--mcp-config-card-radius, 8px);
        padding: 10px 12px;
        text-align: center;
    }

    .analytics-card__value {
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        font-size: 16px;
        font-weight: var(--mcp-config-title-font-weight, 500);
        line-height: 1.4;
    }

    .analytics-card__label {
        font-size: 11px;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        margin-top: 4px;
    }

    .analytics-block {
        background: transparent;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--mcp-config-card-radius, 8px);
        padding: var(--mcp-config-card-padding, 16px);
    }

    .analytics-block__title {
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        font-size: var(--mcp-config-title-font-size, 14px);
        font-weight: var(--mcp-config-title-font-weight, 500);
        margin-bottom: 8px;
    }

    .analytics-list__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .analytics-list__item:last-child {
        border-bottom: none;
    }

    .analytics-list__name {
        flex: 1;
    }

    .analytics-list__count {
        min-width: 48px;
        text-align: right;
        font-weight: var(--mcp-config-title-font-weight, 500);
    }

    .analytics-list__meta {
        min-width: 80px;
        text-align: right;
        font-size: 11px;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
    }

    .analytics-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .analytics-note {
        margin-top: 10px;
        font-size: 12px;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        line-height: 1.5;
    }

    .analytics-recent {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .analytics-recent .analytics-note {
        margin-top: 0;
    }

    .analytics-recent__list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 560px;
        overflow: auto;
        padding-right: 2px;
    }

    .analytics-call {
        border: 1px solid var(--b3-border-color);
        border-radius: var(--mcp-config-card-radius, 8px);
        background: transparent;
    }

    .analytics-call.eventError {
        border-color: var(--b3-theme-error);
    }

    .analytics-call__summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        list-style-position: outside;
    }

    .analytics-call__main {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
    }

    .analytics-call__name {
        font-weight: var(--mcp-config-title-font-weight, 500);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .analytics-call__time,
    .analytics-call__meta,
    .analytics-call__stats,
    .analytics-call__pane-title span {
        font-size: 11px;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
    }

    .analytics-call__aside {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 0 0 auto;
    }

    .analytics-call__meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .analytics-call__copy {
        flex: 0 0 auto;
        padding: 2px 8px;
        min-height: 24px;
        line-height: 20px;
    }

    .analytics-call__status {
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
    }

    .analytics-call.eventError .analytics-call__status {
        color: var(--b3-theme-error);
    }

    .analytics-call__body {
        border-top: 1px solid var(--b3-border-color);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .analytics-call__stats {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }

    .analytics-call__error {
        color: var(--b3-theme-error);
        font-size: 12px;
    }

    .analytics-call__columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }

    .analytics-call__pane {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .analytics-call__pane-title {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-weight: var(--mcp-config-title-font-weight, 500);
    }

    .analytics-call__pane pre {
        margin: 0;
        max-height: 260px;
        overflow: auto;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font-family: var(--mcp-config-code-font);
        font-size: 12px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .telemetry-section {
        display: flex;
        flex-direction: column;
        gap: var(--mcp-config-section-gap, 14px);
        font-size: 13px;
    }

    .telemetry-hint {
        padding: var(--mcp-config-card-padding, 16px);
        background: var(--b3-card-info-background, rgba(74, 127, 255, 0.1));
        border-left: 3px solid var(--b3-theme-primary, #4a7fff);
        border-radius: var(--mcp-config-card-radius, 8px);
    }

    .telemetry-preview {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .telemetry-preview__code {
        margin: 0;
        padding: 10px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        overflow: auto;
        max-height: 240px;
        font-family: var(--mcp-config-code-font);
        font-size: 12px;
        white-space: pre-wrap;
        word-break: break-all;
    }

    @media (max-width: 720px) {
        .analytics-grid {
            grid-template-columns: repeat(2, 1fr);
        }

        .analytics-call__summary,
        .analytics-call__columns {
            grid-template-columns: 1fr;
        }

        .analytics-call__summary {
            align-items: flex-start;
            flex-direction: column;
        }

        .analytics-call__meta {
            justify-content: flex-start;
        }

        .analytics-call__aside {
            justify-content: space-between;
            width: 100%;
        }
    }
</style>
