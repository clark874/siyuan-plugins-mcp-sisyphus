import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "./index.scss";

import {
    buildDefaultHttpServerSettings,
    buildDefaultPuppySettings,
    loadPersistedHttpServerSettings,
    loadPersistedPuppySettings,
    loadPersistedToolConfig,
    savePersistedHttpServerSettings,
    savePersistedToolConfig,
    type HttpServerSettings,
    type PuppySettings,
} from "@/setting/tool-config-storage";
import McpConfig from "@/setting/mcp-config.svelte";
import ToolPuppy from "@/components/ToolPuppy.svelte";
import { HttpServerLauncher } from "@/server-launcher";

export default class SiyuanMCP extends Plugin {
    private puppyComponent: ToolPuppy | null = null;
    private puppyVisible = true;
    private puppyContainer: HTMLElement | null = null;
    private puppySettings: PuppySettings = buildDefaultPuppySettings();
    public httpSettings: HttpServerSettings = buildDefaultHttpServerSettings();
    public httpLauncher: HttpServerLauncher | null = null;

    async onload() {
        const normalized = await loadPersistedToolConfig(this);
        await savePersistedToolConfig(normalized, this);
        this.puppySettings = await loadPersistedPuppySettings(this);
        this.puppyVisible = this.puppySettings.visible;
        this.httpSettings = await loadPersistedHttpServerSettings(this);

        if (HttpServerLauncher.isSupported()) {
            try {
                // In SiYuan's CJS bundle, global require is available
                const nodeRequire: NodeRequire = (typeof require === "function")
                    ? require
                    : (window as unknown as { require: NodeRequire }).require;
                const path = nodeRequire("path") as typeof import("path");
                const workspaceDir = (window as any)?.siyuan?.config?.system?.workspaceDir;
                if (!workspaceDir) {
                    throw new Error("siyuan workspaceDir not available");
                }
                const scriptPath = path.join(workspaceDir, "data", "plugins", this.name, "mcp-server.cjs");
                this.httpLauncher = new HttpServerLauncher(scriptPath);
                if (this.httpSettings.enabled) {
                    try {
                        await this.startHttpServer();
                    } catch (err) {
                        console.error("[MCP] auto-start HTTP server failed:", err);
                    }
                }
            } catch (err) {
                console.error("[MCP] failed to init HttpServerLauncher:", err);
            }
        }
    }

    async startHttpServer(): Promise<void> {
        if (!this.httpLauncher) return;
        const siyuanToken = (window as any)?.siyuan?.config?.api?.token ?? undefined;
        await this.httpLauncher.start({
            host: this.httpSettings.host,
            port: this.httpSettings.port,
            token: this.httpSettings.authEnabled ? this.httpSettings.token : undefined,
            siyuanApiUrl: "http://127.0.0.1:6806",
            siyuanToken,
        });
    }

    async stopHttpServer(): Promise<void> {
        await this.httpLauncher?.stop();
    }

    async setHttpServerSettings(next: HttpServerSettings): Promise<HttpServerSettings> {
        this.httpSettings = await savePersistedHttpServerSettings(next, this);
        return this.httpSettings;
    }

    async updateHttpServerSettings(next: HttpServerSettings): Promise<HttpServerSettings> {
        const wasRunning = this.httpLauncher?.getStatus().running ?? false;
        if (wasRunning) {
            try { await this.stopHttpServer(); } catch (err) { console.error("[MCP] stop before update failed:", err); }
        }
        await this.setHttpServerSettings(next);
        if (wasRunning || next.enabled) {
            try {
                await this.startHttpServer();
            } catch (err) {
                console.error("[MCP] restart after settings change failed:", err);
            }
        }
        return this.httpSettings;
    }

    onLayoutReady() {
        this.puppyContainer = document.createElement('div');
        this.puppyContainer.id = 'sy-puppy-root';
        document.body.appendChild(this.puppyContainer);
        this.puppyComponent = new ToolPuppy({
            target: this.puppyContainer,
            props: {
                visible: this.puppyVisible,
                testModeEnabled: this.puppySettings.testModeEnabled,
                testModeIntervalMs: this.puppySettings.testModeIntervalMs,
                showBubble: this.puppySettings.showBubble,
                showClickHint: this.puppySettings.showClickHint,
            },
        });
    }


    updatePuppyTestSettings(settings: PuppySettings) {
        this.puppySettings = settings;
        this.puppyVisible = settings.visible;
        if (this.puppyComponent) {
            this.puppyComponent.$set({
                visible: settings.visible,
                testModeEnabled: settings.testModeEnabled,
                testModeIntervalMs: settings.testModeIntervalMs,
                showBubble: settings.showBubble,
                showClickHint: settings.showClickHint,
            });
        }
    }

    async onunload() {
        if (this.puppyComponent) {
            this.puppyComponent.$destroy();
            this.puppyComponent = null;
        }
        if (this.puppyContainer) {
            this.puppyContainer.remove();
            this.puppyContainer = null;
        }
        if (this.httpLauncher) {
            try {
                await this.stopHttpServer();
            } catch (err) {
                console.error("[MCP] stop HTTP server during unload failed:", err);
            }
        }
    }

    uninstall() {
        this.removeData("mcpToolsConfig").catch(e => {
            showMessage(`uninstall [${this.name}] remove data [mcpToolsConfig] fail: ${e.msg}`);
        });
    }

    /**
     * A custom setting pannel provided by svelte
     */
    openSetting(): void {
        let dialog = new Dialog({
            title: this.i18n.mcpToolsSettingTitle,
            content: `<div id="SettingPanel" style="height: 100%;"></div>`,
            width: "800px",
            destroyCallback: () => {
                //You'd better destroy the component when the dialog is closed
                pannel.$destroy();
            }
        });
        let pannel = new McpConfig({
            target: dialog.element.querySelector("#SettingPanel"),
            props: {
                plugin: this
            }
        });
    }

}
