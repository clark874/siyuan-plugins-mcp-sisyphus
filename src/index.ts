import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "./index.scss";

import {
    buildDefaultHttpServerSettings,
    buildDefaultPuppySettings,
    hasValidHttpTlsFiles,
    loadPersistedHttpServerSettings,
    loadPersistedPuppySettings,
    loadPersistedToolConfigState,
    savePersistedHttpServerSettings,
    savePersistedToolConfig,
    type HttpServerSettings,
    type PuppySettings,
} from "@/ui/setting/tool-config-storage";
import { emitToolConfigWarningOnce } from "@/core/config";
import McpConfig from "@/ui/setting/mcp-config.svelte";
import ToolPuppy from "@/ui/components/ToolPuppy.svelte";

import { HttpServerLauncher } from "@/server-launcher";

export default class SiyuanMCP extends Plugin {
    private puppyComponent: ToolPuppy | null = null;
    private puppyVisible = true;
    private puppyContainer: HTMLElement | null = null;
    private puppySettings: PuppySettings = buildDefaultPuppySettings();
    public httpSettings: HttpServerSettings = buildDefaultHttpServerSettings();
    public httpLauncher: HttpServerLauncher | null = null;

    async onload() {
        const { config: normalized, warning } = await loadPersistedToolConfigState(this);
        if (warning) {
            emitToolConfigWarningOnce(warning, (message) => {
                console.warn(message);
                showMessage(message);
            });
        }
        await savePersistedToolConfig(normalized, this);
        this.puppySettings = await loadPersistedPuppySettings(this);
        this.puppyVisible = this.puppySettings.visible;
        this.httpSettings = await loadPersistedHttpServerSettings(this);

        const support = HttpServerLauncher.getSupportInfo();
        if (!support.supported) {
            return;
        }

        const scriptPath = HttpServerLauncher.resolveServerScriptPath(this.name);
        if (!scriptPath) {
            return;
        }

        try {
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

    async startHttpServer(): Promise<void> {
        if (!this.httpLauncher) return;
        if (!hasValidHttpTlsFiles(this.httpSettings)) {
            throw new Error("HTTPS requires both certificate and key file paths.");
        }
        const siyuanToken = (window as any)?.siyuan?.config?.api?.token ?? undefined;
        await this.httpLauncher.start({
            host: this.httpSettings.host,
            port: this.httpSettings.port,
            token: this.httpSettings.authEnabled ? this.httpSettings.token : undefined,
            siyuanApiUrl: "http://127.0.0.1:6806",
            siyuanToken,
            tlsCertFile: this.httpSettings.tlsEnabled && this.httpSettings.tlsCertFile ? this.httpSettings.tlsCertFile : undefined,
            tlsKeyFile: this.httpSettings.tlsEnabled && this.httpSettings.tlsKeyFile ? this.httpSettings.tlsKeyFile : undefined,
            tlsCaFile: this.httpSettings.tlsEnabled && this.httpSettings.tlsCaFile ? this.httpSettings.tlsCaFile : undefined,
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
        if ((wasRunning || next.enabled) && !hasValidHttpTlsFiles(next)) {
            throw new Error("HTTPS requires both certificate and key file paths.");
        }
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

    async refreshHttpServerAfterUserRulesChange(): Promise<boolean> {
        const wasRunning = this.httpLauncher?.getStatus().running ?? false;
        if (!wasRunning) {
            return false;
        }
        if (!hasValidHttpTlsFiles(this.httpSettings)) {
            throw new Error("HTTPS requires both certificate and key file paths.");
        }
        try {
            await this.stopHttpServer();
        } catch (err) {
            console.error("[MCP] stop before user rules refresh failed:", err);
        }
        await this.startHttpServer();
        return true;
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
        const isMobileEnv = typeof window !== "undefined" && (
            (window as any)?.siyuan?.config?.system?.os === "android" ||
            (window as any)?.siyuan?.config?.system?.os === "ios" ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        );

        if (isMobileEnv && document.getElementById("model")) {
            const modelElement = document.getElementById("model");
            modelElement.style.transform = "translateY(0px)";
            modelElement.style.zIndex = (++(window as any).siyuan.zIndex).toString();
            const iconElement = modelElement.querySelector(".toolbar__icon");
            if (iconElement) {
                iconElement.classList.add("fn__none");
            }
            const titleElement = modelElement.querySelector(".toolbar__text") as HTMLElement;
            if (titleElement) {
                titleElement.textContent = this.i18n.mcpToolsSettingTitle;
                titleElement.style.display = "block";
                titleElement.style.overflow = "visible";
                titleElement.style.width = "100%";
                titleElement.style.textAlign = "center";
                titleElement.style.color = "var(--b3-theme-on-background)";
            }
            const modelMainElement = modelElement.querySelector("#modelMain") as HTMLElement;
            modelMainElement.innerHTML = `<div id="SettingPanel" style="height: 100%;"></div>`;

            let pannel = new McpConfig({
                target: modelMainElement.querySelector("#SettingPanel"),
                props: { plugin: this }
            });

            const closeBtn = document.getElementById("modelClose");
            const onClose = () => {
                pannel.$destroy();
                modelMainElement.innerHTML = "";
                if (closeBtn) {
                    closeBtn.removeEventListener("click", onClose);
                }
            };
            if (closeBtn) {
                closeBtn.addEventListener("click", onClose);
            }

            // Also observe #modelMain in case other code clears it before close button is clicked
            const observer = new MutationObserver(() => {
                if (!modelMainElement.querySelector("#SettingPanel")) {
                    pannel.$destroy();
                    observer.disconnect();
                    if (closeBtn) {
                        closeBtn.removeEventListener("click", onClose);
                    }
                }
            });
            observer.observe(modelMainElement, { childList: true });
            return;
        }

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
