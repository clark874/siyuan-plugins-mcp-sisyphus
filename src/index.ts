import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "./index.scss";

import {
    buildDefaultHttpServerSettings,
    buildDefaultPuppySettings,
    buildDefaultVersionControlSettings,
    hasValidHttpTlsFiles,
    loadPersistedHttpServerSettings,
    loadPersistedPuppySettings,
    loadPersistedToolConfigState,
    loadPersistedVersionControlSettings,
    savePersistedHttpServerSettings,
    savePersistedToolConfig,
    savePersistedVersionControlSettings,
    type HttpServerSettings,
    type PuppySettings,
    type VersionControlSettings,
} from "@/ui/setting/tool-config-storage";
import { emitToolConfigWarningOnce } from "@/core/config";
import { submitFeedback, type FeedbackInput, type FeedbackSubmitResult } from "@/core/feedback";
import McpConfig from "@/ui/setting/mcp-config.svelte";
import ToolPuppy from "@/ui/components/ToolPuppy.svelte";
import VersionControlPanel from "@/ui/version-control/VersionControlPanel.svelte";

import { HttpServerLauncher, appendHttpLifecycleLog } from "@/server-launcher";

const PUPPY_ROOT_ID = "sy-puppy-root";
const VERSION_CONTROL_DOCK_TYPE = "sisyphusTimelineDock";
const VERSION_CONTROL_DOCK_POSITION = "RightBottom";
const VERSION_CONTROL_DOCK_ROOT_ID = "SisyphusTimelineDockPanel";
const VERSION_CONTROL_ICON_ID = "iconSisyphusTimelineDock";
const VERSION_CONTROL_ICON_SYMBOL = `<symbol id="${VERSION_CONTROL_ICON_ID}" viewBox="0 0 24 24"><path fill="currentColor" d="M7 3a3 3 0 0 1 2 5.24v1.27l6 3V8.24A3 3 0 1 1 17 9v5a1 1 0 0 1-1.45.89L9 11.62v4.14A3 3 0 1 1 7 15.76V8.24A3 3 0 0 1 7 3Zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM7 17a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></symbol>`;

type CurrentDocumentContext = {
    id: string;
    title: string;
};

export default class SiyuanMCP extends Plugin {
    private puppyComponent: ToolPuppy | null = null;
    private versionControlPanel: VersionControlPanel | null = null;
    private versionControlContainer: HTMLElement | null = null;
    private currentDocument: CurrentDocumentContext = { id: "", title: "" };
    private puppyVisible = true;
    private puppyContainer: HTMLElement | null = null;
    private puppySettings: PuppySettings = buildDefaultPuppySettings();
    private versionControlSettings: VersionControlSettings = buildDefaultVersionControlSettings();
    private versionControlDockRegistered = false;
    private versionControlCommandRegistered = false;
    private versionControlEventsRegistered = false;
    private versionControlIconRegistered = false;
    private versionControlSettingsLoaded = false;
    private versionControlDockElement: HTMLElement | null = null;
    private versionControlDockRegistration: { config?: any; model?: any } | null = null;
    private versionControlDockRegisteredType = "";
    public httpSettings: HttpServerSettings = buildDefaultHttpServerSettings();
    public httpLauncher: HttpServerLauncher | null = null;

    async onload() {
        appendHttpLifecycleLog("[plugin] onload begin");
        this.registerVersionControlIcon();

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
        this.versionControlSettings = await loadPersistedVersionControlSettings(this);
        this.versionControlSettingsLoaded = true;
        appendHttpLifecycleLog(`[plugin] settings loaded: httpEnabled=${this.httpSettings.enabled} timelineEnabled=${this.versionControlSettings.enabled}`);
        this.syncVersionControlFeature();

        const support = HttpServerLauncher.getSupportInfo();
        if (!support.supported) {
            appendHttpLifecycleLog(`[plugin] HTTP launcher unsupported: ${support.reason ?? "unknown"}`);
            return;
        }

        const scriptPath = HttpServerLauncher.resolveServerScriptPath(this.name);
        if (!scriptPath) {
            appendHttpLifecycleLog("[plugin] HTTP launcher unsupported: server script path unavailable");
            return;
        }

        try {
            this.httpLauncher = new HttpServerLauncher(scriptPath);
            appendHttpLifecycleLog(`[plugin] HTTP launcher initialized: ${scriptPath}`);
            if (this.httpSettings.enabled) {
                try {
                    await this.startHttpServer();
                } catch (err) {
                    appendHttpLifecycleLog(`[plugin] auto-start HTTP server failed: ${err instanceof Error ? err.message : String(err)}`);
                    console.error("[MCP] auto-start HTTP server failed:", err);
                }
            }
        } catch (err) {
            appendHttpLifecycleLog(`[plugin] failed to init HTTP launcher: ${err instanceof Error ? err.message : String(err)}`);
            console.error("[MCP] failed to init HttpServerLauncher:", err);
        }
    }

    async startHttpServer(): Promise<void> {
        if (!this.httpLauncher) {
            appendHttpLifecycleLog("[plugin] start HTTP skipped: launcher unavailable");
            return;
        }
        if (!hasValidHttpTlsFiles(this.httpSettings)) {
            appendHttpLifecycleLog("[plugin] start HTTP rejected: missing TLS certificate or key");
            throw new Error("HTTPS requires both certificate and key file paths.");
        }
        appendHttpLifecycleLog(`[plugin] start HTTP requested: ${this.httpSettings.host}:${this.httpSettings.port}`);
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
        appendHttpLifecycleLog("[plugin] stop HTTP requested");
        await this.httpLauncher?.stop();
    }

    getHttpServerSupportInfo() {
        return HttpServerLauncher.getSupportInfo();
    }

    async setHttpServerSettings(next: HttpServerSettings): Promise<HttpServerSettings> {
        this.httpSettings = await savePersistedHttpServerSettings(next, this);
        return this.httpSettings;
    }

    async updateHttpServerSettings(next: HttpServerSettings): Promise<HttpServerSettings> {
        const wasRunning = this.httpLauncher?.getStatus().running ?? false;
        appendHttpLifecycleLog(`[plugin] update HTTP settings: wasRunning=${wasRunning} nextEnabled=${next.enabled} host=${next.host} port=${next.port}`);
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
                appendHttpLifecycleLog(`[plugin] restart after settings change failed: ${err instanceof Error ? err.message : String(err)}`);
                console.error("[MCP] restart after settings change failed:", err);
            }
        }
        return this.httpSettings;
    }

    async refreshHttpServerAfterInstructionConfigChange(): Promise<boolean> {
        const wasRunning = this.httpLauncher?.getStatus().running ?? false;
        appendHttpLifecycleLog(`[plugin] refresh HTTP after instruction config change: wasRunning=${wasRunning}`);
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

    async refreshHttpServerAfterUserRulesChange(): Promise<boolean> {
        return this.refreshHttpServerAfterInstructionConfigChange();
    }

    private mountPuppy() {
        const existingRoots = Array.from(document.querySelectorAll<HTMLElement>(`#${PUPPY_ROOT_ID}`));
        const isMounted =
            Boolean(this.puppyComponent) &&
            this.puppyContainer instanceof HTMLElement &&
            this.puppyContainer.id === PUPPY_ROOT_ID &&
            this.puppyContainer.isConnected;
        const hasForeignOrDuplicateRoot = existingRoots.some((root) => root !== this.puppyContainer);

        if (isMounted && !hasForeignOrDuplicateRoot) {
            return;
        }

        this.unmountPuppy();
        for (const root of existingRoots) {
            root.remove();
        }

        this.puppyContainer = document.createElement("div");
        this.puppyContainer.id = PUPPY_ROOT_ID;
        document.body.appendChild(this.puppyContainer);
        this.puppyComponent = new ToolPuppy({
            target: this.puppyContainer,
            props: {
                visible: this.puppyVisible,
                testModeEnabled: this.puppySettings.testModeEnabled,
                testModeIntervalMs: this.puppySettings.testModeIntervalMs,
                showBubble: this.puppySettings.showBubble,
                showClickHint: this.puppySettings.showClickHint,
                appearance: this.puppySettings.appearance,
            },
        });
    }

    private unmountPuppy() {
        this.puppyComponent?.$destroy();
        this.puppyComponent = null;

        if (this.puppyContainer) {
            this.puppyContainer.remove();
            this.puppyContainer = null;
        }

        const orphanRoots = document.querySelectorAll<HTMLElement>(`#${PUPPY_ROOT_ID}`);
        for (const root of orphanRoots) {
            root.remove();
        }
    }

    onLayoutReady() {
        this.mountPuppy();
        if (this.versionControlSettingsLoaded) this.syncVersionControlFeature();
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
                appearance: settings.appearance,
            });
        }
    }

    async updateVersionControlSettings(settings: VersionControlSettings): Promise<void> {
        this.versionControlSettings = await savePersistedVersionControlSettings(settings, this);
        appendHttpLifecycleLog(`[timeline] settings updated: enabled=${this.versionControlSettings.enabled} showDebugMeta=${this.versionControlSettings.showDebugMeta}`);
        this.syncVersionControlFeature();
    }

    async submitFeedback(input: FeedbackInput): Promise<FeedbackSubmitResult> {
        return submitFeedback(input, this.createFeedbackFetch());
    }

    private createFeedbackFetch(): typeof fetch {
        const req = this.getNodeRequire();
        if (req) {
            try {
                const https = req("https") as typeof import("https");
                const http = req("http") as typeof import("http");
                return ((url: string, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
                    const target = new URL(url);
                    const transport = target.protocol === "http:" ? http : https;
                    const headers = init.headers instanceof Headers
                        ? Object.fromEntries(init.headers.entries())
                        : (init.headers ?? {}) as Record<string, string>;
                    const rawBody = init.body
                        ? (typeof init.body === "string" || Buffer.isBuffer(init.body) ? init.body : String(init.body))
                        : undefined;
                    const request = transport.request(target, {
                        method: init.method ?? "GET",
                        headers: {
                            ...headers,
                            ...(rawBody && !Object.keys(headers).some((key) => key.toLowerCase() === "content-length")
                                ? { "Content-Length": Buffer.byteLength(rawBody) }
                                : {}),
                        },
                    }, (response) => {
                        const chunks: Buffer[] = [];
                        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                        response.on("end", () => {
                            const responseHeaders = new Headers();
                            for (const [key, value] of Object.entries(response.headers)) {
                                if (Array.isArray(value)) {
                                    for (const item of value) responseHeaders.append(key, item);
                                } else if (typeof value === "string") {
                                    responseHeaders.set(key, value);
                                }
                            }
                            resolve(new Response(Buffer.concat(chunks), {
                                status: response.statusCode ?? 0,
                                statusText: response.statusMessage ?? "",
                                headers: responseHeaders,
                            }));
                        });
                    });
                    request.on("error", reject);
                    if (rawBody) {
                        request.write(rawBody);
                    }
                    request.end();
                })) as typeof fetch;
            } catch {
                // Fall through to global fetch below.
            }
        }
        if (typeof fetch === "function") {
            return fetch.bind(globalThis);
        }
        throw new Error("Feedback submission is unavailable in this environment.");
    }

    private getNodeRequire(): NodeRequire | undefined {
        if (typeof require === "function") {
            try {
                require("https");
                return require;
            } catch { /* not Node require */ }
        }
        if (typeof window !== "undefined") {
            const w = window as unknown as { require?: NodeRequire };
            if (typeof w.require === "function") return w.require;
        }
        return undefined;
    }

    async onunload() {
        appendHttpLifecycleLog("[plugin] onunload begin");
        this.unregisterVersionControlEvents();
        this.unmountVersionControlDock();
        this.unmountPuppy();
        if (this.httpLauncher) {
            try {
                await this.stopHttpServer();
            } catch (err) {
                appendHttpLifecycleLog(`[plugin] stop HTTP during unload failed: ${err instanceof Error ? err.message : String(err)}`);
                console.error("[MCP] stop HTTP server during unload failed:", err);
            }
        }
        appendHttpLifecycleLog("[plugin] onunload end");
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
            width: "min(1120px, calc(100vw - 56px))",
            height: "min(680px, calc(100vh - 72px))",
            destroyCallback: () => {
                //You'd better destroy the component when the dialog is closed
                pannel.$destroy();
            }
        });
        dialog.element.classList.add("sisyphus-settings-dialog");
        let pannel = new McpConfig({
            target: dialog.element.querySelector("#SettingPanel"),
            props: {
                plugin: this
            }
        });
    }

    openVersionControl(protyle?: unknown): void {
        if (!this.versionControlSettings.enabled) {
            showMessage(this.i18n?.timeline_disabled_msg || "文档时间树已关闭");
            return;
        }
        this.syncVersionControlFeature();
        const context = this.getDocumentContextFromProtyle(protyle) ?? this.currentDocument;
        this.updateVersionControlDocument(context, { force: true });
        this.showVersionControlDock();
    }

    private syncVersionControlFeature() {
        appendHttpLifecycleLog(`[timeline] sync feature: enabled=${this.versionControlSettings.enabled}`);
        if (!this.versionControlSettings.enabled) {
            this.disableVersionControlFeature();
            return;
        }
        this.enableVersionControlFeature();
    }

    private enableVersionControlFeature() {
        appendHttpLifecycleLog("[timeline] enable feature");
        this.registerVersionControlIcon();
        this.registerVersionControlCommand();
        this.registerVersionControlDock();
        this.registerVersionControlEvents();
        this.ensureVersionControlPanelMounted();
        this.versionControlPanel?.$set({
            showDebugMeta: this.versionControlSettings.showDebugMeta,
        });
    }

    private disableVersionControlFeature() {
        appendHttpLifecycleLog("[timeline] disable feature");
        this.unregisterVersionControlCommand();
        this.unregisterVersionControlEvents();
        this.unmountVersionControlPanel();
        this.removeVersionControlDock();
    }

    private registerVersionControlIcon() {
        if (this.versionControlIconRegistered) return;
        this.addIcons(VERSION_CONTROL_ICON_SYMBOL);
        this.versionControlIconRegistered = true;
    }

    private registerVersionControlCommand() {
        if (!this.versionControlSettingsLoaded) return;
        if (this.versionControlCommandRegistered) return;
        const addCommand = (this as any).addCommand;
        if (typeof addCommand !== "function") return;
        addCommand.call(this, {
            langKey: "openSnapshotVersionControl",
            langText: this.i18n?.timeline_open_command || "打开文档时间线",
            hotkey: "",
            callback: () => this.openVersionControl(),
            editorCallback: (protyle: any) => this.openVersionControl(protyle),
        });
        this.versionControlCommandRegistered = true;
    }

    private unregisterVersionControlCommand() {
        if (!this.versionControlCommandRegistered) return;
        const commands = (this as any).commands;
        if (Array.isArray(commands)) {
            for (let i = commands.length - 1; i >= 0; i--) {
                if (commands[i]?.langKey === "openSnapshotVersionControl") {
                    commands.splice(i, 1);
                }
            }
        }
        this.versionControlCommandRegistered = false;
    }

    private registerVersionControlDock() {
        if (!this.versionControlSettingsLoaded) return;
        if (!this.versionControlSettings.enabled) return;
        if (this.versionControlDockRegistered) {
            if (this.isVersionControlDockRegistrationAlive()) return;
            appendHttpLifecycleLog("[timeline] dock registration stale; re-register");
            const dockTypes = this.getVersionControlDockTypes();
            this.unmountVersionControlDock();
            this.removeVersionControlDockButtons(dockTypes);
            this.versionControlDockRegistered = false;
            this.versionControlDockRegistration = null;
            this.versionControlDockRegisteredType = "";
        }

        const addDock = (this as any).addDock;
        if (typeof addDock !== "function") return;
        appendHttpLifecycleLog("[timeline] register dock");
        const registration = addDock.call(this, {
            config: {
                position: VERSION_CONTROL_DOCK_POSITION,
                size: { width: 420, height: 0 },
                icon: VERSION_CONTROL_ICON_ID,
                title: this.i18n?.timeline_dock_title || "文档时间线",
                show: true,
            },
            data: {},
            type: VERSION_CONTROL_DOCK_TYPE,
            init: (dock: any) => {
                const element = dock?.element as HTMLElement | undefined;
                if (!element) return;
                this.versionControlDockElement = element;
                this.mountVersionControlPanel(element);
            },
            update: () => {
                if (!this.versionControlSettings.enabled) return;
                this.updateVersionControlDocument(this.currentDocument, { force: true });
            },
            destroy: () => this.unmountVersionControlDock(),
        });
        this.versionControlDockRegistered = true;
        this.versionControlDockRegistration = registration ?? null;
        const registeredConfig = registration?.config as any;
        const registeredModel = registration?.model as any;
        this.versionControlDockRegisteredType = firstNonEmptyString([
            registeredConfig?.type,
            registeredModel?.type,
            this.name ? `${this.name}${VERSION_CONTROL_DOCK_TYPE}` : "",
            VERSION_CONTROL_DOCK_TYPE,
        ]);
    }

    private isVersionControlDockRegistrationAlive(): boolean {
        if (this.versionControlDockElement?.isConnected) return true;

        const dockTypes = this.getVersionControlDockTypes();
        if (dockTypes.length === 0) return false;

        const layout = (window as any)?.siyuan?.layout;
        const targetDock = getDockByPosition(layout, VERSION_CONTROL_DOCK_POSITION);
        const dockData = targetDock?.data;
        if (dockData && typeof dockData === "object") {
            for (const dockType of dockTypes) {
                if (Object.prototype.hasOwnProperty.call(dockData, dockType)) return true;
            }
        }

        const uiLayout = (window as any)?.siyuan?.config?.uiLayout;
        const dockLayout = uiLayout?.right;
        if (Array.isArray(dockLayout?.data)) {
            for (const group of dockLayout.data) {
                if (!Array.isArray(group)) continue;
                if (group.some((item) => dockTypes.includes(item?.type))) return true;
            }
        }

        const pluginDocks = (this as any).docks;
        if (!layout && pluginDocks && typeof pluginDocks === "object") {
            for (const dockType of dockTypes) {
                if (Object.prototype.hasOwnProperty.call(pluginDocks, dockType)) return true;
            }
        }

        return false;
    }

    private ensureVersionControlPanelMounted() {
        if (this.versionControlPanel || !this.versionControlDockElement) return;
        this.mountVersionControlPanel(this.versionControlDockElement);
    }

    private mountVersionControlPanel(element: HTMLElement) {
        if (!this.versionControlSettings.enabled) return;
        if (!this.versionControlSettingsLoaded) return;
        this.unmountVersionControlPanel();
        element.innerHTML = `<div id="${VERSION_CONTROL_DOCK_ROOT_ID}" style="height: 100%;"></div>`;
        this.versionControlContainer = element.querySelector(`#${VERSION_CONTROL_DOCK_ROOT_ID}`);
        if (!this.versionControlContainer) return;
        this.versionControlPanel = new VersionControlPanel({
            target: this.versionControlContainer,
            props: {
                currentDocumentId: this.currentDocument.id,
                currentDocumentTitle: this.currentDocument.title,
                showDebugMeta: this.versionControlSettings.showDebugMeta,
                i18n: this.i18n ?? {},
            },
        });
    }

    private registerVersionControlEvents() {
        if (!this.versionControlSettingsLoaded) return;
        if (!this.versionControlSettings.enabled || this.versionControlEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        if (typeof eventBus?.on !== "function") return;
        eventBus.on("switch-protyle", this.handleVersionControlProtyleChange as any);
        eventBus.on("loaded-protyle-dynamic", this.handleVersionControlProtyleChange as any);
        eventBus.on("loaded-protyle-static", this.handleVersionControlProtyleChange as any);
        this.versionControlEventsRegistered = true;
    }

    private unregisterVersionControlEvents() {
        if (!this.versionControlEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        eventBus?.off?.("switch-protyle", this.handleVersionControlProtyleChange as any);
        eventBus?.off?.("loaded-protyle-dynamic", this.handleVersionControlProtyleChange as any);
        eventBus?.off?.("loaded-protyle-static", this.handleVersionControlProtyleChange as any);
        this.versionControlEventsRegistered = false;
    }

    private readonly handleVersionControlProtyleChange = (event: CustomEvent<{ protyle?: unknown }>) => {
        if (!this.versionControlSettings.enabled) return;
        const context = this.getDocumentContextFromProtyle(event?.detail?.protyle);
        if (context) this.updateVersionControlDocument(context);
    };

    private getDocumentContextFromProtyle(protyle: unknown): CurrentDocumentContext | null {
        if (!protyle || typeof protyle !== "object") return null;
        const record = protyle as Record<string, any>;
        const block = record.block && typeof record.block === "object" ? record.block : {};
        const id = firstNonEmptyString([
            block.rootID,
            block.id,
            record.rootID,
            record.id,
        ]);
        if (!id) return null;
        return {
            id,
            title: firstNonEmptyString([
                record.title,
                block.name,
                block.content,
                getDocumentTitleFromPath(record.hpath),
                getDocumentTitleFromPath(record.path),
                this.currentDocument.id === id ? this.currentDocument.title : "",
            ]) || id,
        };
    }

    private updateVersionControlDocument(context: CurrentDocumentContext, options: { force?: boolean } = {}) {
        if (!this.versionControlSettings.enabled) return;
        this.currentDocument = context;
        if (!options.force && !this.isVersionControlPanelVisible()) return;
        this.versionControlPanel?.$set({
            currentDocumentId: context.id,
            currentDocumentTitle: context.title,
        });
    }

    private isVersionControlPanelVisible(): boolean {
        if (!this.versionControlContainer) return false;
        if (!this.versionControlContainer.getClientRects().length) return false;
        let element: HTMLElement | null = this.versionControlContainer;
        while (element) {
            if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
            if (typeof getComputedStyle === "function") {
                const style = getComputedStyle(element);
                if (style.display === "none" || style.visibility === "hidden") return false;
            }
            element = element.parentElement;
        }
        return true;
    }

    private showVersionControlDock() {
        if (!this.versionControlSettings.enabled) return;
        const layout = (window as any)?.siyuan?.layout;
        const targetDock = getDockByPosition(layout, VERSION_CONTROL_DOCK_POSITION);
        if (typeof targetDock?.toggleModel === "function") {
            targetDock.toggleModel(this.getVersionControlDockTypes()[0] ?? VERSION_CONTROL_DOCK_TYPE, true, false, false, true);
            return;
        }
        targetDock?.showDock?.();
    }

    private unmountVersionControlPanel() {
        this.versionControlPanel?.$destroy();
        this.versionControlPanel = null;
        if (this.versionControlContainer) {
            this.versionControlContainer.innerHTML = "";
            this.versionControlContainer = null;
        }
    }

    private unmountVersionControlDock() {
        this.unmountVersionControlPanel();
        this.versionControlDockElement = null;
    }

    private removeVersionControlDock() {
        appendHttpLifecycleLog("[timeline] remove dock");
        const layout = (window as any)?.siyuan?.layout;
        const targetDock = getDockByPosition(layout, VERSION_CONTROL_DOCK_POSITION);
        const dockTypes = this.getVersionControlDockTypes();
        if (typeof targetDock?.toggleModel === "function") {
            for (const dockType of dockTypes) {
                targetDock.toggleModel(dockType, false, true, true, true);
            }
        }
        if (typeof targetDock?.remove === "function") {
            for (const dockType of dockTypes) {
                targetDock.remove(dockType);
            }
        }
        this.removeVersionControlDockRegistry(dockTypes, layout);
        this.removeVersionControlDockLayout(dockTypes);
        this.removeVersionControlDockButtons(dockTypes);
        this.versionControlDockRegistered = false;
        this.versionControlDockElement = null;
        this.versionControlDockRegistration = null;
        this.versionControlDockRegisteredType = "";
    }

    private getVersionControlDockTypes(): string[] {
        const registeredConfig = this.versionControlDockRegistration?.config as any;
        const registeredModel = this.versionControlDockRegistration?.model as any;
        return [
            registeredConfig?.type,
            registeredModel?.type,
            this.versionControlDockRegisteredType,
            this.name ? `${this.name}${VERSION_CONTROL_DOCK_TYPE}` : "",
            VERSION_CONTROL_DOCK_TYPE,
        ].filter((value, index, values): value is string => (
            typeof value === "string" &&
            value.length > 0 &&
            values.indexOf(value) === index
        ));
    }

    private removeVersionControlDockRegistry(dockTypes: string[], layout: any) {
        const pluginDocks = (this as any).docks;
        if (pluginDocks && typeof pluginDocks === "object") {
            for (const dockType of dockTypes) {
                delete pluginDocks[dockType];
            }
        }

        for (const dock of [layout?.leftDock, layout?.rightDock, layout?.bottomDock]) {
            const dockData = dock?.data;
            if (!dockData || typeof dockData !== "object") continue;
            for (const dockType of dockTypes) {
                delete dockData[dockType];
            }
        }
    }

    private removeVersionControlDockLayout(dockTypes: string[]) {
        const uiLayout = (window as any)?.siyuan?.config?.uiLayout;
        for (const position of ["left", "right", "bottom"]) {
            const dock = uiLayout?.[position];
            if (!Array.isArray(dock?.data)) continue;
            dock.data = dock.data
                .map((group: any) => Array.isArray(group)
                    ? group.filter((item) => !dockTypes.includes(item?.type))
                    : group)
                .filter((group: any) => !Array.isArray(group) || group.length > 0);
        }
    }

    private removeVersionControlDockButtons(dockTypes: string[]) {
        if (typeof document === "undefined") return;
        for (const dockType of dockTypes) {
            const escapedDockType = escapeCssAttributeValue(dockType);
            const selectors = [
                `.dock__item[data-type="${escapedDockType}"]`,
                `.dock__item[data-id="${escapedDockType}"]`,
                `[data-type="${escapedDockType}"].dock__item`,
                `[data-id="${escapedDockType}"].dock__item`,
                `.dock__item[data-type$="${escapeCssAttributeValue(VERSION_CONTROL_DOCK_TYPE)}"]`,
                `.dock__item[data-id$="${escapeCssAttributeValue(VERSION_CONTROL_DOCK_TYPE)}"]`,
            ];
            for (const element of Array.from(document.querySelectorAll<HTMLElement>(selectors.join(", ")))) {
                const dockItem = element.closest?.(".dock__item") as HTMLElement | null;
                (dockItem ?? element).remove();
            }
        }

        const escapedIconId = escapeCssAttributeValue(`#${VERSION_CONTROL_ICON_ID}`);
        const iconSelectors = [
            `.dock__item[data-icon="${escapeCssAttributeValue(VERSION_CONTROL_ICON_ID)}"]`,
            `.dock__item use[href="${escapedIconId}"]`,
            `.dock__item use[xlink\\:href="${escapedIconId}"]`,
            `.dock__item [href="${escapedIconId}"]`,
            `.dock__item [xlink\\:href="${escapedIconId}"]`,
        ];
        for (const element of Array.from(document.querySelectorAll<HTMLElement>(iconSelectors.join(", ")))) {
            const dockItem = element.closest?.(".dock__item") as HTMLElement | null;
            (dockItem ?? element).remove();
        }
    }

}

function firstNonEmptyString(values: unknown[]): string {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function getDocumentTitleFromPath(path: unknown): string {
    if (typeof path !== "string" || !path.trim()) return "";
    const segment = path.split("/").filter(Boolean).at(-1) ?? "";
    return segment.replace(/\.sy$/i, "") || "";
}

function getDockByPosition(layout: any, position: string): any {
    if (position.startsWith("Left")) return layout?.leftDock;
    if (position.startsWith("Bottom")) return layout?.bottomDock;
    return layout?.rightDock;
}

function escapeCssAttributeValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
