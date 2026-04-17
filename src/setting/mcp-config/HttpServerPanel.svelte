<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { showMessage } from "siyuan";

    import SettingPanel from "../../libs/components/setting-panel.svelte";
    import type { HttpServerStatus } from "../../server-launcher";
    import { hasValidHttpTlsFiles, regenerateHttpServerToken, savePersistedHttpServerSettings, type HttpServerSettings } from "../tool-config-storage";

    export let plugin: any;
    export let group: string;
    export let display = false;
    export let httpSettings: HttpServerSettings;
    export let getLabel: (key: string, fallback: string) => string;

    let httpStatus: HttpServerStatus = { running: false, host: httpSettings.host, port: httpSettings.port };
    let httpRecentLogs: string[] = [];
    let httpDirty = false;
    let httpBusy = false;
    let httpUnsubStatus: (() => void) | null = null;
    let httpUnsubLogs: (() => void) | null = null;

    onMount(() => {
        if (plugin?.httpLauncher) {
            httpStatus = plugin.httpLauncher.getStatus();
            httpRecentLogs = plugin.httpLauncher.getRecentLogs();
            httpUnsubStatus = plugin.httpLauncher.onStatusChange((s: HttpServerStatus) => {
                httpStatus = s;
            });
            httpUnsubLogs = plugin.httpLauncher.onLogsChange((lines: string[]) => {
                httpRecentLogs = lines;
            });
        }
    });

    onDestroy(() => {
        httpUnsubStatus?.();
        httpUnsubLogs?.();
    });

    function getWorkspaceScriptPath(): string {
        const workspaceDir = (window as any)?.siyuan?.config?.system?.workspaceDir;
        if (typeof workspaceDir !== "string" || !workspaceDir.trim()) {
            return "{SIYUAN_PATH}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs";
        }
        return `${workspaceDir.replace(/[\\/]+$/, "")}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs`;
    }

    function getSiYuanApiToken(): string {
        const token = (window as any)?.siyuan?.config?.api?.token;
        if (typeof token !== "string" || !token.trim()) {
            return "xxxxxx";
        }
        return token;
    }

    function onTlsEnabledChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        httpSettings = { ...httpSettings, tlsEnabled: target.checked };
        httpDirty = true;
    }

    function getTlsMissingFilesMessage(): string {
        return getLabel("httpTlsMissingFiles", "⚠️ Cert and Key file paths are required for HTTPS.");
    }

    function validateTlsBeforeStart(): boolean {
        if (hasValidHttpTlsFiles(httpSettings)) {
            return true;
        }
        showMessage(getTlsMissingFilesMessage());
        return false;
    }

    function generateClientSnippet(s: HttpServerSettings, mode: "direct" | "stdio" | "bridge"): string {
        const scheme = s.tlsEnabled ? "https" : "http";
        const url = `${scheme}://${s.host}:${s.port}/mcp`;
        if (mode === "direct") {
            const headers = s.authEnabled ? { Authorization: `Bearer ${s.token}` } : undefined;
            const obj: any = { mcpServers: { siyuan: { type: "http", url } } };
            if (headers) obj.mcpServers.siyuan.headers = headers;
            return JSON.stringify(obj, null, 2);
        }
        if (mode === "bridge") {
            const args = ["mcp-remote", url];
            if (s.authEnabled) {
                args.push("--header", `Authorization: Bearer ${s.token}`);
            }
            return JSON.stringify({ mcpServers: { siyuan: { command: "npx", args } } }, null, 2);
        }
        return JSON.stringify({
            mcpServers: {
                siyuan: {
                    command: "node",
                    args: [getWorkspaceScriptPath()],
                    env: {
                        SIYUAN_API_URL: "http://127.0.0.1:6806",
                        SIYUAN_TOKEN: getSiYuanApiToken(),
                    },
                },
            },
        }, null, 2);
    }

    async function copyText(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            showMessage(getLabel("copySuccess", "✅ Copied"));
        } catch {
            showMessage(getLabel("copyFailed", "Failed to copy to clipboard"));
        }
    }

    async function persistHttpSettings(next: HttpServerSettings, restart: boolean) {
        if (!plugin) return;
        if (restart && typeof plugin.updateHttpServerSettings === "function") {
            httpBusy = true;
            try {
                httpSettings = await plugin.updateHttpServerSettings(next);
            } finally {
                httpBusy = false;
            }
        } else if (typeof plugin.setHttpServerSettings === "function") {
            httpSettings = await plugin.setHttpServerSettings(next);
        } else {
            httpSettings = await savePersistedHttpServerSettings(next, plugin);
        }
        httpDirty = false;
    }

    async function toggleHttpServer() {
        if (!plugin?.httpLauncher) {
            showMessage(getLabel("httpUnsupported", "HTTP server is only available in the SiYuan desktop app."));
            return;
        }
        httpBusy = true;
        try {
            if (httpStatus.running) {
                await plugin.stopHttpServer();
            } else {
                if (!validateTlsBeforeStart()) {
                    return;
                }
                if (httpDirty) {
                    await persistHttpSettings(httpSettings, false);
                }
                await plugin.startHttpServer();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showMessage(`${getLabel("httpStartError", "HTTP server error")}: ${msg}`);
        } finally {
            httpBusy = false;
        }
    }

    async function applyHttpSettings() {
        if (!validateTlsBeforeStart()) {
            return;
        }
        await persistHttpSettings(httpSettings, true);
        showMessage(getLabel("httpSettingsSaved", "✅ HTTP server settings saved"));
    }

    function regenerateToken() {
        httpSettings = regenerateHttpServerToken(httpSettings);
        httpDirty = true;
    }

    function markHttpDirty() {
        httpDirty = true;
    }

    async function toggleHttpAutoStart(value: boolean) {
        const next = { ...httpSettings, enabled: value };
        await persistHttpSettings(next, false);
    }

    async function onHttpAutoStartChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        await toggleHttpAutoStart(target.checked);
    }

    function onHttpAuthChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        httpSettings = { ...httpSettings, authEnabled: target.checked };
        httpDirty = true;
    }
</script>

<SettingPanel {group} settingItems={[]} {display}>
    <div class="http-server-section">
        <div class="http-status-row">
            <span class="http-status-dot" class:running={httpStatus.running}></span>
            {#if httpStatus.running}
                <span class="http-status-text">
                    {getLabel("httpStatusRunning", "Running")}: <code>{httpSettings.tlsEnabled ? "https" : "http"}://{httpStatus.host}:{httpStatus.port}/mcp</code>
                    {#if httpStatus.pid} (PID {httpStatus.pid}){/if}
                </span>
            {:else}
                <span class="http-status-text">{getLabel("httpStatusStopped", "Stopped")}</span>
                {#if httpStatus.lastError}
                    <span class="http-error">{httpStatus.lastError}</span>
                {/if}
            {/if}
        </div>

        {#if !plugin?.httpLauncher}
            <div class="http-warning">{getLabel("httpUnsupported", "HTTP server is only available in the SiYuan desktop app.")}</div>
        {/if}

        <div class="http-actions">
            <button class="b3-button b3-button--outline" on:click={toggleHttpServer} disabled={httpBusy || !plugin?.httpLauncher}>
                {httpStatus.running ? getLabel("httpStop", "Stop") : getLabel("httpStart", "Start")}
            </button>
            <button class="b3-button b3-button--outline" on:click={applyHttpSettings} disabled={httpBusy || !httpDirty}>
                {getLabel("httpApply", "Apply & Restart")}
            </button>
        </div>

        <div class="http-form">
            <label class="http-field">
                <input type="checkbox" checked={httpSettings.enabled} on:change={onHttpAutoStartChange} />
                {getLabel("httpAutoStart", "Auto-start with SiYuan")}
            </label>

            <label class="http-field">
                <span class="http-label">{getLabel("httpHost", "Host")}</span>
                <input type="text" class="b3-text-field" bind:value={httpSettings.host} on:input={markHttpDirty} placeholder="127.0.0.1" />
            </label>

            <label class="http-field">
                <span class="http-label">{getLabel("httpPort", "Port")}</span>
                <input type="number" class="b3-text-field" bind:value={httpSettings.port} on:input={markHttpDirty} min="1" max="65535" />
            </label>

            <label class="http-field">
                <input type="checkbox" checked={httpSettings.authEnabled} on:change={onHttpAuthChange} />
                {getLabel("httpEnableAuth", "Require Bearer token")}
            </label>

            {#if httpSettings.authEnabled}
                <div class="http-field http-token-row">
                    <span class="http-label">{getLabel("httpToken", "Token")}</span>
                    <input type="text" class="b3-text-field http-token-input" readonly value={httpSettings.token} />
                    <button class="b3-button b3-button--outline" on:click={() => copyText(httpSettings.token)}>{getLabel("httpCopy", "Copy")}</button>
                    <button class="b3-button b3-button--outline" on:click={regenerateToken}>{getLabel("httpRegenerate", "Regenerate")}</button>
                </div>
            {/if}

            <label class="http-field">
                <input type="checkbox" checked={httpSettings.tlsEnabled} on:change={onTlsEnabledChange} />
                {getLabel("httpEnableTls", "Enable HTTPS (TLS)")}
            </label>

            {#if httpSettings.tlsEnabled}
                <label class="http-field">
                    <span class="http-label">{getLabel("httpTlsCert", "Cert")}</span>
                    <input type="text" class="b3-text-field http-path-input" bind:value={httpSettings.tlsCertFile} on:input={markHttpDirty} placeholder={getLabel("httpTlsCertPlaceholder", "/path/to/cert.pem")} />
                </label>
                <label class="http-field">
                    <span class="http-label">{getLabel("httpTlsKey", "Key")}</span>
                    <input type="text" class="b3-text-field http-path-input" bind:value={httpSettings.tlsKeyFile} on:input={markHttpDirty} placeholder={getLabel("httpTlsKeyPlaceholder", "/path/to/key.pem")} />
                </label>
                <label class="http-field">
                    <span class="http-label">{getLabel("httpTlsCa", "CA")}</span>
                    <input type="text" class="b3-text-field http-path-input" bind:value={httpSettings.tlsCaFile} on:input={markHttpDirty} placeholder={getLabel("httpTlsCaPlaceholder", "/path/to/ca.pem (optional)")} />
                </label>
                {#if !hasValidHttpTlsFiles(httpSettings)}
                    <div class="http-warning">{getTlsMissingFilesMessage()}</div>
                {/if}
            {/if}
        </div>

        {#if httpSettings.host !== "127.0.0.1" && httpSettings.host !== "localhost" && !httpSettings.authEnabled}
            <div class="http-warning">{getLabel("httpWarnExposedNoAuth", "⚠️ Bound to a non-loopback address with auth disabled. Other devices on the network can access your SiYuan workspace.")}</div>
        {/if}

        <details class="http-snippet">
            <summary>{getLabel("httpClientSnippet", "HTTP Connection")}</summary>
            <pre>{generateClientSnippet(httpSettings, "direct")}</pre>
            <button class="b3-button b3-button--outline" on:click={() => copyText(generateClientSnippet(httpSettings, "direct"))}>{getLabel("httpCopy", "Copy")}</button>
        </details>

        <details class="http-snippet">
            <summary>{getLabel("httpClientSnippetBridge", "mcp-remote Bridge")}</summary>
            <pre>{generateClientSnippet(httpSettings, "bridge")}</pre>
            <button class="b3-button b3-button--outline" on:click={() => copyText(generateClientSnippet(httpSettings, "bridge"))}>{getLabel("httpCopy", "Copy")}</button>
        </details>
        <details class="http-snippet">
            <summary>{getLabel("httpClientSnippetRemote", "stdio Connection")}</summary>
            <pre>{generateClientSnippet(httpSettings, "stdio")}</pre>
            <button class="b3-button b3-button--outline" on:click={() => copyText(generateClientSnippet(httpSettings, "stdio"))}>{getLabel("httpCopy", "Copy")}</button>
        </details>
        <details class="http-snippet">
            <summary>{getLabel("httpRecentLogs", "Recent server logs")}</summary>
            <pre class="http-log-box">{httpRecentLogs.length ? httpRecentLogs.join("\n") : getLabel("httpNoLogs", "(no logs yet)")}</pre>
        </details>
    </div>
</SettingPanel>

<style lang="scss">
    .http-server-section {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        font-size: 13px;

        .http-status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .http-status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--b3-theme-error, #d33);
            display: inline-block;
        }

        .http-status-dot.running {
            background: var(--b3-theme-success, #3b3);
        }

        .http-status-text code {
            background: var(--b3-theme-surface);
            padding: 1px 6px;
            border-radius: 3px;
        }

        .http-error {
            color: var(--b3-theme-error, #d33);
        }

        .http-warning {
            padding: 8px 12px;
            background: var(--b3-card-warning-background, rgba(255, 180, 0, 0.12));
            border-left: 3px solid var(--b3-theme-warning, #e0a000);
            border-radius: 3px;
            color: var(--b3-card-warning-color, inherit);
        }

        .http-actions {
            display: flex;
            gap: 8px;
        }

        .http-form {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .http-field {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .http-label {
            min-width: 60px;
        }

        .http-token-row {
            .http-token-input {
                flex: 1;
                min-width: 240px;
                font-family: monospace;
                font-size: 12px;
            }
        }

        .http-path-input {
            flex: 1;
            min-width: 280px;
            font-family: monospace;
            font-size: 12px;
        }

        .http-snippet {
            background: var(--b3-theme-surface);
            border-radius: 4px;
            padding: 8px 12px;

            summary {
                cursor: pointer;
                user-select: none;
            }

            pre {
                margin: 8px 0;
                padding: 8px;
                background: var(--b3-theme-background);
                border-radius: 3px;
                overflow: auto;
                max-height: 200px;
                font-size: 12px;
            }
        }

        .http-log-box {
            white-space: pre-wrap;
            word-break: break-all;
        }
    }
</style>
