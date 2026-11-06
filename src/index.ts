import {
    Plugin,
    showMessage,
    Dialog,
    getAllEditor,
    confirm,
} from "siyuan";
import * as siyuanApi from "siyuan";
import "./index.scss";

import {
    buildDefaultHttpServerSettings,
    buildDefaultPermissionDisplaySettings,
    buildDefaultVersionControlSettings,
    hasValidHttpTlsFiles,
    loadPersistedHttpServerSettings,
    loadPersistedPermissionDisplaySettings,
    normalizePermissionDisplaySettings,
    loadPersistedToolConfigState,
    loadPersistedVersionControlSettings,
    savePersistedHttpServerSettings,
    savePersistedToolConfig,
    savePersistedVersionControlSettings,
    type HttpServerSettings,
    type PermissionDisplaySettings,
    type VersionControlSettings,
} from "@/ui/setting/tool-config-storage";
import {
    clearPermissionTreeIndicators,
    decoratePermissionTree,
    getNextNotebookPermission,
    normalizeNotebookPermissions,
    PERMISSION_TREE_BADGE_CLASS,
    PERMISSION_TREE_CHANGED_EVENT,
    PERMISSION_TREE_ROOT_SELECTOR,
    type NotebookPermission,
    type PermissionTreeLabels,
} from "@/ui/permission-tree-indicator";
import { emitToolConfigWarningOnce } from "@/core/config";
import McpConfig from "@/ui/setting/mcp-config.svelte";
import { LITERATURE_PROFILE_FILE, defaultLiteratureProfile, normalizeLiteratureProfile, validateLiteratureProfile, type LiteratureProfile } from "@/ui/literature/settings";
import { LiteratureReading, readLiteratureAttrs } from "@/ui/literature/reading";
import TranslationPanel from "@/ui/literature/TranslationPanel.svelte";
import type { TranslationProgress } from "@/ui/literature/desktop-runner";
import { runLiteratureTask } from "@/ui/literature/desktop-runner";
import SnapshotPanel from "@/ui/version-control/SnapshotPanel.svelte";
import VersionDiffPanel from "@/ui/version-control/VersionDiffPanel.svelte";
import RecentDocumentsPanel from "@/ui/recent-documents/RecentDocumentsPanel.svelte";
import type {
    RecentDocumentDiffSummary,
    RecentDocumentFolderUnit,
    RecentDocumentView,
} from "@/ui/recent-documents/recent-documents";
import {
    type DocumentDiffSelection,
    getTimelineNodeSelectionKey,
    type RecentHistoryDiffSelection,
    type TimelineNodeSelection,
} from "@/ui/version-control/timeline";

import { HttpServerLauncher, appendHttpLifecycleLog } from "@/server-launcher";

const TRANSLATION_DOCK_TYPE = "sisyphusLiteratureTranslationDock";
const TRANSLATION_ICON_ID = "iconSisyphusTranslate";
const SNAPSHOT_DOCK_TYPE = "sisyphusSnapshotDock";
const SNAPSHOT_DOCK_POSITION = "LeftTop";
const SNAPSHOT_DOCK_ROOT_ID = "SisyphusSnapshotDockPanel";
const SNAPSHOT_ICON_ID = "iconSisyphusSnapshotDock";
const VERSION_CONTROL_DOCK_TYPE = "sisyphusTimelineDock";
const VERSION_CONTROL_DOCK_POSITION = "RightBottom";
const VERSION_CONTROL_DOCK_ROOT_ID = "SisyphusTimelineDockPanel";
const VERSION_CONTROL_ICON_ID = "iconSisyphusTimelineDock";
const RECENT_DOCUMENTS_DOCK_TYPE = "sisyphusRecentDocumentsDock";
const RECENT_DOCUMENTS_DOCK_POSITION = "LeftBottom";
const RECENT_DOCUMENTS_DOCK_ROOT_ID = "SisyphusRecentDocumentsDockPanel";
const RECENT_DOCUMENTS_ICON_ID = "iconSisyphusRecentDocumentsDock";
const RECENT_DOCUMENTS_INVALIDATION_COMMANDS = new Set([
    "transactions",
    "reloadDocInfo",
    "reloadFiletree",
    "rename",
    "moveDoc",
    "removeDoc",
    "create",
]);
const VERSION_CONTROL_ICON_SYMBOLS = [
    `<symbol id="${SNAPSHOT_ICON_ID}" viewBox="0 0 24 24"><path fill="currentColor" d="M7 3a3 3 0 0 1 2 5.24v1.27l6 3V8.24A3 3 0 1 1 17 9v5a1 1 0 0 1-1.45.89L9 11.62v4.14A3 3 0 1 1 7 15.76V8.24A3 3 0 0 1 7 3Zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM7 17a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></symbol>`,
    `<symbol id="${VERSION_CONTROL_ICON_ID}" viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h6v14H4V5Zm10 0h6v14h-6V5ZM6 8v2h2V8H6Zm10 0v2h2V8h-2ZM6 13v2h2v-2H6Zm10 0v2h2v-2h-2Z"/></symbol>`,
    `<symbol id="${RECENT_DOCUMENTS_ICON_ID}" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a9 9 0 1 1-8.49 6H1l3.5-4L8 9H5.62A7 7 0 1 0 12 5V3Zm-1 4h2v5.17l3.24 1.87-1 1.73L11 13.32V7Z"/></symbol>`,
].join("");

type CurrentDocumentContext = {
    id: string;
    title: string;
};

export default class SiyuanMCP extends Plugin {
    private agentSessionUrlRegistered = false;
    private handleAgentSessionUrl = (event: CustomEvent<{ url: string }>) => {
        void this.openAgentSessionUrl(event.detail?.url);
    };
    private snapshotPanel: SnapshotPanel | null = null;
    private diffPanel: VersionDiffPanel | null = null;
    private recentDocumentsPanel: RecentDocumentsPanel | null = null;
    private snapshotContainer: HTMLElement | null = null;
    private diffContainer: HTMLElement | null = null;
    private recentDocumentsContainer: HTMLElement | null = null;
    private currentDocument: CurrentDocumentContext = { id: "", title: "" };
    private timelineSelection: TimelineNodeSelection | null = null;
    private recentHistorySelection: RecentHistoryDiffSelection | null = null;
    private recentDocumentDiffSummaries: Record<string, RecentDocumentDiffSummary> = {};
    private layoutReady = false;
    private versionControlSettings: VersionControlSettings = buildDefaultVersionControlSettings();
    private snapshotDockRegistered = false;
    private diffDockRegistered = false;
    private recentDocumentsDockRegistered = false;
    private versionControlCommandRegistered = false;
    private versionControlEventsRegistered = false;
    private recentDocumentsEventsRegistered = false;
    private versionControlIconRegistered = false;
    private versionControlSettingsLoaded = false;
    private snapshotDockElement: HTMLElement | null = null;
    private diffDockElement: HTMLElement | null = null;
    private recentDocumentsDockElement: HTMLElement | null = null;
    private snapshotDockRegistration: { config?: any; model?: any } | null = null;
    private diffDockRegistration: { config?: any; model?: any } | null = null;
    private recentDocumentsDockRegistration: { config?: any; model?: any } | null = null;
    private snapshotDockRegisteredType = "";
    private diffDockRegisteredType = "";
    private recentDocumentsDockRegisteredType = "";
    private recentDocumentsRefreshVersion = 0;
    private recentDocumentsInvalidationTimer: ReturnType<typeof setTimeout> | null = null;
    private permissionDisplaySettings: PermissionDisplaySettings = buildDefaultPermissionDisplaySettings();
    private permissionDisplaySettingsLoaded = false;
    private permissionTreePermissions: Record<string, NotebookPermission> = {};
    private permissionTreeObserver: MutationObserver | null = null;
    private permissionTreeEventsRegistered = false;
    private permissionTreeClickRegistered = false;
    private permissionTreeFrame: number | null = null;
    private permissionTreeLoadVersion = 0;
    public httpSettings: HttpServerSettings = buildDefaultHttpServerSettings();
    public httpLauncher: HttpServerLauncher | null = null;
    private literatureProfile = defaultLiteratureProfile();
    private readonly literatureReading = new LiteratureReading(this, () => this.literatureProfile.translation,
        message => this.translationPanel?.$set({ status: message }),
        () => {
            this.showTranslationDock();
            return this.translationDockElement?.querySelector<HTMLElement>(".translation-reading-editor") ?? null;
        });
    private readonly translationsRunning = new Set<string>();
    private readonly translationProgress = new Map<string, TranslationProgress>();
    private literatureBatchRunning = false;
    private translationPanel: TranslationPanel | null = null;
    private translationDockType = "";
    private translationDockElement: HTMLElement | null = null;
    private literatureDocument = { id: "", title: "" };
    private translationViewVersion = 0;
    private readonly literatureCredentials = new Map<string, string>();

    async onload() {
        appendHttpLifecycleLog("[plugin] onload begin");
        this.registerAgentSessionUrlHandler();
        this.registerVersionControlIcon();

        const { config: normalized, warning } = await loadPersistedToolConfigState(this);
        if (warning) {
            emitToolConfigWarningOnce(warning, (message) => {
                console.warn(message);
                showMessage(message);
            });
        }
        await savePersistedToolConfig(normalized, this);
        this.httpSettings = await loadPersistedHttpServerSettings(this);
        this.versionControlSettings = await loadPersistedVersionControlSettings(this);
        this.versionControlSettingsLoaded = true;
        this.registerVersionControlCommand();
        this.updateLiteratureProfile(normalizeLiteratureProfile(await this.loadData(LITERATURE_PROFILE_FILE).catch(() => null)));
        this.registerLiteratureReading();
        this.permissionDisplaySettings = await loadPersistedPermissionDisplaySettings(this);
        this.permissionDisplaySettingsLoaded = true;
        appendHttpLifecycleLog(`[plugin] settings loaded: httpEnabled=${this.httpSettings.enabled} timelineEnabled=${this.versionControlSettings.enabled} recentDocumentsEnabled=${this.versionControlSettings.recentDocumentsEnabled}`);
        this.syncVersionControlFeature();
        this.syncRecentDocumentsFeature();
        this.syncPermissionTreeFeature();

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

    async onDataChanged(reason?: "sync" | "overwrite") {
        appendHttpLifecycleLog(`[plugin] data changed: reason=${reason ?? "unknown"}`);
        const [versionControlSettings, permissionDisplaySettings] = await Promise.all([
            loadPersistedVersionControlSettings(this),
            loadPersistedPermissionDisplaySettings(this),
        ]);

        this.versionControlSettings = versionControlSettings;
        this.permissionDisplaySettings = permissionDisplaySettings;
        this.syncVersionControlFeature();
        this.syncRecentDocumentsFeature();
        this.syncPermissionTreeFeature();
        if (this.layoutReady && this.permissionDisplaySettings.showInFileTree) {
            await this.loadPermissionTreePermissions();
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
            skillsExtensionEnabled: this.httpSettings.skillsExtensionEnabled,
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

    onLayoutReady() {
        this.layoutReady = true;
        this.registerTranslationDock();
        if (this.versionControlSettingsLoaded) this.syncVersionControlFeature();
        if (this.versionControlSettingsLoaded) this.syncRecentDocumentsFeature();
        if (this.permissionDisplaySettingsLoaded) this.syncPermissionTreeFeature();
    }


    async updateVersionControlSettings(settings: VersionControlSettings): Promise<void> {
        this.versionControlSettings = await savePersistedVersionControlSettings(settings, this);
        appendHttpLifecycleLog(`[timeline] settings updated: enabled=${this.versionControlSettings.enabled} recentDocumentsEnabled=${this.versionControlSettings.recentDocumentsEnabled} showDebugMeta=${this.versionControlSettings.showDebugMeta}`);
        this.syncVersionControlFeature();
        this.syncRecentDocumentsFeature();
    }

    updatePermissionDisplaySettings(settings: PermissionDisplaySettings): void {
        this.permissionDisplaySettings = normalizePermissionDisplaySettings(settings);
        this.syncPermissionTreeFeature();
    }

    refreshPermissionTreeIndicators(permissions?: unknown): void {
        if (permissions !== undefined) {
            this.permissionTreePermissions = normalizeNotebookPermissions(permissions);
            this.emitPermissionTreeChange();
        }
        if (!this.permissionDisplaySettings.showInFileTree || !this.layoutReady) return;
        this.schedulePermissionTreeDecoration();
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
        this.unregisterAgentSessionUrlHandler();
        this.eventBus.off("loaded-protyle-static", this.handleLiteratureEditor);
        this.eventBus.off("switch-protyle", this.handleLiteratureEditor);
        this.eventBus.off("open-menu-breadcrumbmore", this.handleLiteratureMenu);
        this.literatureReading.reset();
        this.literatureCredentials.clear();
        this.translationViewVersion += 1;
        this.translationPanel?.$destroy();
        this.translationPanel = null;
        this.translationDockElement = null;
        this.layoutReady = false;
        this.permissionDisplaySettingsLoaded = false;
        this.disablePermissionTreeFeature();
        this.disableRecentDocumentsFeature();
        this.unregisterVersionControlEvents();
        this.unmountVersionControlDocks();
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

    private registerAgentSessionUrlHandler() {
        if (this.agentSessionUrlRegistered) return;
        const eventBus = (this as any).eventBus;
        if (typeof eventBus?.on !== "function") return;
        eventBus.on("open-siyuan-url-plugin", this.handleAgentSessionUrl as any);
        this.agentSessionUrlRegistered = true;
    }

    private unregisterAgentSessionUrlHandler() {
        if (!this.agentSessionUrlRegistered) return;
        (this as any).eventBus?.off?.("open-siyuan-url-plugin", this.handleAgentSessionUrl as any);
        this.agentSessionUrlRegistered = false;
    }

    private async openAgentSessionUrl(rawUrl?: string) {
        if (!rawUrl) return;
        let url: URL;
        try { url = new URL(rawUrl); } catch { return; }
        if (url.hostname !== "plugins" || url.pathname.replace(/^\/+/, "") !== this.name) return;
        if (url.searchParams.get("action") !== "open-agent-session") return;
        const provider = url.searchParams.get("provider") ?? "";
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const hostAlias = url.searchParams.get("hostAlias") || "local";
        if (hostAlias !== "local") {
            showMessage(`会话位于主机 ${hostAlias}，当前设备不能直接打开。`);
            return;
        }
        if (!/^[^\u0000-\u001f]{1,256}$/.test(sessionId)) {
            showMessage("会话标识无效，已拒绝启动。", 5000, "error");
            return;
        }
        const nodeRequire = this.getNodeRequire();
        if (!nodeRequire) {
            showMessage("当前前端不支持启动本机 Agent。", 5000, "error");
            return;
        }
        const childProcess = nodeRequire("child_process") as typeof import("child_process");
        let command = "";
        let args: string[] = [];
        if (provider === "codex") {
            const nativeUrl = `codex://threads/${encodeURIComponent(sessionId)}`;
            if (process.platform === "darwin") { command = "open"; args = [nativeUrl]; }
            else if (process.platform === "win32") { command = "cmd"; args = ["/c", "start", "", nativeUrl]; }
            else { command = "xdg-open"; args = [nativeUrl]; }
        } else if (provider === "zcode" || provider === "claude-code" || provider === "hermes") {
            const resume = provider === "hermes"
                ? `hermes --resume '${sessionId.replace(/'/g, "'\\''")}'`
                : `${provider === "zcode" ? "zcode" : "claude"} --resume '${sessionId.replace(/'/g, "'\\''")}'`;
            showMessage(`该 Agent 尚未确认原生会话深链。请在终端执行：${resume}`, 10000);
            return;
        } else {
            showMessage(`当前尚未配置 ${provider || "该 Agent"} 的会话启动适配器。`, 5000, "error");
            return;
        }
        try {
            const child = childProcess.spawn(command, args, { detached: true, stdio: "ignore", shell: false });
            child.once("error", (error) => showMessage(`Agent 会话启动失败：${error.message}`, 5000, "error"));
            child.unref();
        } catch (error) {
            showMessage(`Agent 会话启动失败：${error instanceof Error ? error.message : String(error)}`, 5000, "error");
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

    updateLiteratureProfile(profile: LiteratureProfile) {
        this.literatureProfile = profile;
        this.literatureReading.reset();
        this.translationPanel?.$set({ profile });
        void this.updateTranslationDocument(this.literatureDocument);
    }

    setLiteratureCredentials(profile: LiteratureProfile, zoteroKey: string, translationKey: string) {
        validateLiteratureProfile(profile);
        for (const [name, value] of [[profile.zotero.apiKeyEnv, zoteroKey], [profile.translation.apiKeyEnv, translationKey]]) {
            if (name && value) this.literatureCredentials.set(name, value);
        }
    }

    clearLiteratureCredentials() { this.literatureCredentials.clear(); }

    private getLiteratureCredentials(names: string[]) {
        return Object.fromEntries(names.flatMap(name => {
            const value = this.literatureCredentials.get(name);
            return value ? [[name, value]] : [];
        }));
    }

    async checkLiteratureRuntime(profile: LiteratureProfile) {
        validateLiteratureProfile(profile);
        return runLiteratureTask<Record<string, string>>(this.name, this.httpSettings, "ingest-literature-batch.mjs",
            ["--desktop", "--check-runtime"], { profile },
            this.getLiteratureCredentials([profile.zotero.apiKeyEnv, profile.translation.apiKeyEnv]));
    }

    async runLiteratureBatch(profile: LiteratureProfile, manifest: string, receipt: string, execute: boolean) {
        if (this.literatureBatchRunning) throw new Error("已有批量文献任务在运行。");
        if (!HttpServerLauncher.isSupported()) throw new Error("请在思源桌面客户端运行批量入库。");
        const { isAbsolute } = require("path") as typeof import("path");
        if (![manifest, receipt].every(isAbsolute)) throw new Error("批次清单与收据须使用本机绝对路径。");
        this.literatureBatchRunning = true;
        try {
            return await runLiteratureTask<{ mode: string; complete?: boolean }>(
                this.name, this.httpSettings, "ingest-literature-batch.mjs",
                ["--desktop", "--manifest", manifest, "--receipt", receipt, ...(execute ? ["--execute"] : [])],
                { profile }, this.getLiteratureCredentials([profile.zotero.apiKeyEnv, profile.translation.apiKeyEnv]),
            );
        } finally {
            this.literatureBatchRunning = false;
        }
    }

    private readonly handleLiteratureEditor = (event: CustomEvent) => {
        const editor = event.detail?.protyle;
        const context = this.getDocumentContextFromProtyle(editor);
        if (!context || !editor?.element?.closest('[data-type="wnd"]')) return;
        void this.updateTranslationDocument(context);
        this.literatureReading.onEditorLoaded(editor);
    };

    private async updateTranslationDocument(context: CurrentDocumentContext) {
        if (!context.id) return;
        const version = ++this.translationViewVersion;
        try {
            const attrs = await readLiteratureAttrs(context.id);
            if (version !== this.translationViewVersion) return;
            const sourceId = attrs["custom-literature-original-id"] || context.id;
            if (sourceId !== context.id && this.literatureDocument.id === sourceId) return;
            const sourceAttrs = sourceId === context.id ? attrs : await readLiteratureAttrs(sourceId);
            if (version !== this.translationViewVersion) return;
            this.literatureDocument = { id: sourceId, title: sourceAttrs.title || context.title };
            const translationId = sourceAttrs["custom-literature-translation-id"] || "";
            this.translationPanel?.$set({
                documentId: sourceId, documentTitle: this.literatureDocument.title,
                translationId, running: this.translationsRunning.has(sourceId), progress: this.translationProgress.get(sourceId) ?? null,
                ...(!this.literatureReading.isOpen(sourceId) ? {
                    status: this.translationsRunning.has(sourceId) ? "正在翻译全文，可继续阅读原文。" : translationId ? "已有中文译文，可开启双屏对照。" : "此文档尚无中文译文。",
                } : {}),
            });
        } catch (error) {
            if (version === this.translationViewVersion) this.translationPanel?.$set({ status: error.message });
        }
    }

    private registerTranslationDock() {
        if (this.translationDockType) return;
        const plugin = this;
        (this as any).addIcons?.(`<symbol id="${TRANSLATION_ICON_ID}" viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v2H8v2h4v2h-1c-.4 2-1.2 3.7-2.4 5.1L11 16l-1.3 1.5-2.5-2c-1.1.9-2.5 1.7-4.2 2.5l-.8-1.8c1.4-.6 2.6-1.3 3.5-2.1C4.5 12.7 3.7 11 3.2 9H2V7h4V5H3V3Zm2.3 6c.4 1.4 1 2.6 1.9 3.7.9-1.1 1.5-2.3 1.8-3.7H5.3ZM16 7h2l5 14h-2.2l-1.2-3h-5.2l-1.1 3H11l5-14Zm1 3.2L15 16h4l-2-5.8Z"/></symbol>`);
        const registration = (this as any).addDock?.({
            config: { position: "RightTop", size: { width: 400, height: 0 }, icon: TRANSLATION_ICON_ID, title: "文献翻译", show: this.getInitialDockVisibility("RightTop", [this.name + TRANSLATION_DOCK_TYPE], true) },
            type: TRANSLATION_DOCK_TYPE, data: {},
            init: (dock: any) => {
                plugin.translationDockElement = dock.element;
                plugin.translationPanel = new TranslationPanel({ target: dock.element, props: {
                    plugin, profile: plugin.literatureProfile,
                    documentId: plugin.literatureDocument.id, documentTitle: plugin.literatureDocument.title,
                } });
                const context = plugin.getActiveDocumentContext();
                if (context) void plugin.updateTranslationDocument(context);
            },
            update: () => {
                const context = plugin.getActiveDocumentContext();
                if (context) void plugin.updateTranslationDocument(context);
            },
            destroy: () => { plugin.literatureReading.reset(); plugin.translationPanel?.$destroy(); plugin.translationPanel = null; plugin.translationDockElement = null; },
        });
        this.translationDockType = this.getRegisteredDockType(registration, TRANSLATION_DOCK_TYPE);
        const context = this.getActiveDocumentContext();
        if (context) void this.updateTranslationDocument(context);
    }

    private showTranslationDock() {
        this.registerTranslationDock();
        const target = getDockByPosition((window as any).siyuan?.layout, "RightTop");
        target?.toggleModel?.(this.translationDockType, true, false, false, true);
    }

    public translateCurrentLiterature(documentId: string) { void this.requestLiteratureTranslation(documentId); }

    public openLiteratureComparison(documentId: string) {
        void this.literatureReading.open(documentId, true).catch(error => {
            this.translationPanel?.$set({ status: error.message });
            showMessage(error.message);
        });
    }

    private readonly handleLiteratureMenu = (event: CustomEvent) => {
        const { protyle, menu } = event.detail ?? {};
        if (!protyle?.notebookId) return;
        const context = this.getDocumentContextFromProtyle(protyle);
        if (!context) return;
        menu?.addItem?.({
            icon: "iconLanguage",
            label: "文献翻译与双屏对照",
            click: () => { this.showTranslationDock(); void this.updateTranslationDocument(context); },
        });
        menu?.addItem?.({
            icon: "iconLayoutRight",
            label: "打开中英文对照",
            click: () => void this.literatureReading.open(context.id, true).catch(error => showMessage(error.message)),
        });
    };

    private registerLiteratureReading() {
        this.eventBus.on("loaded-protyle-static", this.handleLiteratureEditor);
        this.eventBus.on("switch-protyle", this.handleLiteratureEditor);
        this.eventBus.on("open-menu-breadcrumbmore", this.handleLiteratureMenu);
        this.addCommand({
            langKey: "translateLiteratureDocument",
            langText: "打开文献翻译与双屏对照",
            hotkey: "",
            callback: () => this.showTranslationDock(),
            editorCallback: (editor) => { this.showTranslationDock(); const context = this.getDocumentContextFromProtyle(editor); if (context) void this.updateTranslationDocument(context); },
        });
    }

    private async requestLiteratureTranslation(documentId?: string) {
        if (!documentId) { showMessage("请先打开文献库中的论文原文。"); return; }
        const { siyuan, zotero, translation } = this.literatureProfile;
        if (!translation.configPath) {
            this.showTranslationDock();
            this.translationPanel?.$set({ status: "请在此面板保存 mdtx 程序和配置文件，再翻译全文。" });
            return;
        }
        if (this.translationsRunning.has(documentId)) { showMessage("此论文的翻译正在运行。"); return; }
        const attrs = await readLiteratureAttrs(documentId).catch(() => null);
        if (!attrs) { showMessage("暂时无法读取论文配对信息。"); return; }
        if (attrs["custom-literature-original-id"]) { showMessage("请从论文原文打开对照阅读。"); return; }
        confirm("翻译论文全文", "将用本机 mdtx 配置处理当前论文全文。若配置使用外部模型，正文会发送到该服务并产生调用费用。完成后在原文下归档中文译文。", () => {
            if (this.translationsRunning.has(documentId)) return;
            this.translationsRunning.add(documentId);
            const initial = { stage: "读取原文与文献角色标记" };
            this.translationProgress.set(documentId, initial);
            this.translationPanel?.$set({ progress: initial });
            this.translationPanel?.$set({ running: true, status: "正在翻译全文，可继续阅读原文。" });
            showMessage("文献全文翻译已启动。");
            void runLiteratureTask<{ translationId: string }>(
                this.name, this.httpSettings, "translate-literature.mjs", [],
                { documentId, settings: translation, zoteroApiKeyEnv: zotero.apiKeyEnv },
                this.getLiteratureCredentials([translation.apiKeyEnv]),
                progress => {
                    this.translationProgress.set(documentId, progress);
                    if (this.literatureDocument.id === documentId) this.translationPanel?.$set({ progress });
                },
            ).then(async () => {
                showMessage("中文译文已归档。");
                if (this.literatureDocument.id === documentId) {
                    await this.updateTranslationDocument(this.literatureDocument);
                    await this.literatureReading.open(documentId, true);
                }
            }).catch(error => {
                showMessage(String(error.message));
                const progress = { stage: "翻译未完成，请按提示处理后续跑" };
                this.translationProgress.set(documentId, progress);
                if (this.literatureDocument.id === documentId) this.translationPanel?.$set({ status: String(error.message), progress });
            }).finally(() => {
                this.translationsRunning.delete(documentId);
                if (this.literatureDocument.id === documentId) this.translationPanel?.$set({ running: false });
            });
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
        this.showSnapshotDock();
    }

    private syncVersionControlFeature() {
        appendHttpLifecycleLog(`[timeline] sync feature: enabled=${this.versionControlSettings.enabled}`);
        if (!this.versionControlSettings.enabled) {
            this.disableVersionControlFeature();
            return;
        }
        this.enableVersionControlFeature();
    }

    private syncRecentDocumentsFeature() {
        appendHttpLifecycleLog(`[recent-documents] sync feature: enabled=${this.versionControlSettings.recentDocumentsEnabled}`);
        if (!this.versionControlSettingsLoaded || !this.versionControlSettings.recentDocumentsEnabled) {
            this.disableRecentDocumentsFeature();
            return;
        }
        this.enableRecentDocumentsFeature();
    }

    private syncPermissionTreeFeature() {
        if (!this.permissionDisplaySettingsLoaded || !this.layoutReady) return;
        if (!this.permissionDisplaySettings.showInFileTree) {
            this.disablePermissionTreeFeature();
            return;
        }
        this.enablePermissionTreeFeature();
    }

    private enablePermissionTreeFeature() {
        this.registerPermissionTreeEvents();
        this.registerPermissionTreeClick();
        this.registerPermissionTreeObserver();
        void this.loadPermissionTreePermissions();
    }

    private disablePermissionTreeFeature() {
        this.permissionTreeLoadVersion += 1;
        this.unregisterPermissionTreeEvents();
        this.unregisterPermissionTreeClick();
        this.permissionTreeObserver?.disconnect();
        this.permissionTreeObserver = null;
        if (
            this.permissionTreeFrame !== null &&
            typeof window !== "undefined" &&
            typeof window.cancelAnimationFrame === "function"
        ) {
            window.cancelAnimationFrame(this.permissionTreeFrame);
        }
        this.permissionTreeFrame = null;
        if (typeof document !== "undefined") {
            clearPermissionTreeIndicators(document);
        }
    }

    private registerPermissionTreeEvents() {
        if (this.permissionTreeEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        if (typeof eventBus?.on !== "function") return;
        eventBus.on("ws-main", this.handlePermissionTreeWebSocket as any);
        this.permissionTreeEventsRegistered = true;
    }

    private unregisterPermissionTreeEvents() {
        if (!this.permissionTreeEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        eventBus?.off?.("ws-main", this.handlePermissionTreeWebSocket as any);
        this.permissionTreeEventsRegistered = false;
    }

    private registerPermissionTreeClick() {
        if (this.permissionTreeClickRegistered || typeof document.addEventListener !== "function") return;
        document.addEventListener("click", this.handlePermissionTreeBadgeClick, true);
        this.permissionTreeClickRegistered = true;
    }

    private unregisterPermissionTreeClick() {
        if (!this.permissionTreeClickRegistered || typeof document.removeEventListener !== "function") return;
        document.removeEventListener("click", this.handlePermissionTreeBadgeClick, true);
        this.permissionTreeClickRegistered = false;
    }

    private registerPermissionTreeObserver() {
        if (this.permissionTreeObserver || typeof MutationObserver === "undefined" || !document.body) return;
        this.permissionTreeObserver = new MutationObserver((mutations) => {
            const touchesPermissionTree = mutations.some((mutation) => (
                Array.from(mutation.addedNodes).some((node) => {
                    if (!(node instanceof Element)) return false;
                    return Boolean(
                        node.matches(".file-tree, .sy__file, ul[data-url], li[data-type=\"navigation-root\"]") ||
                        node.closest("li[data-type=\"navigation-root\"]") ||
                        node.querySelector(PERMISSION_TREE_ROOT_SELECTOR)
                    );
                })
            ));
            if (touchesPermissionTree) {
                this.schedulePermissionTreeDecoration();
            }
        });
        this.permissionTreeObserver.observe(document.body, { childList: true, subtree: true });
    }

    private async loadPermissionTreePermissions() {
        const loadVersion = ++this.permissionTreeLoadVersion;
        const raw = await this.loadData("notebookPermissions");
        if (
            loadVersion !== this.permissionTreeLoadVersion ||
            !this.layoutReady ||
            !this.permissionDisplaySettings.showInFileTree
        ) return;
        this.permissionTreePermissions = normalizeNotebookPermissions(raw);
        this.emitPermissionTreeChange();
        this.schedulePermissionTreeDecoration();
    }

    private schedulePermissionTreeDecoration() {
        if (this.permissionTreeFrame !== null || typeof window === "undefined") return;
        if (typeof window.requestAnimationFrame !== "function") {
            decoratePermissionTree(document, this.permissionTreePermissions, this.getPermissionTreeLabels());
            return;
        }
        this.permissionTreeFrame = window.requestAnimationFrame(() => {
            this.permissionTreeFrame = null;
            if (!this.layoutReady || !this.permissionDisplaySettings.showInFileTree) return;
            decoratePermissionTree(document, this.permissionTreePermissions, this.getPermissionTreeLabels());
        });
    }

    private getPermissionTreeLabels(): PermissionTreeLabels {
        return {
            names: {
                none: this.i18n?.mcpPermNone || "无权限",
                r: this.i18n?.mcpPermRead || "只读",
                rw: this.i18n?.mcpPermReadWrite || "读写不可删除",
                rwd: this.i18n?.mcpPermReadWriteDelete || "读写可删除",
            },
            defaultSuffix: this.i18n?.permission_tree_default_suffix || "（默认）",
            pluginName: this.i18n?.permission_tree_plugin_name || "插件：思源 sisyphus MCP & CLI & GIT",
            notebookScope: this.i18n?.permission_tree_scope || "应用于整个笔记本及其子文档",
            clickToChange: this.i18n?.permission_tree_click_hint || "点击切换权限",
        };
    }

    private emitPermissionTreeChange() {
        if (
            typeof window === "undefined" ||
            typeof window.dispatchEvent !== "function" ||
            typeof CustomEvent === "undefined"
        ) return;
        window.dispatchEvent(new CustomEvent(PERMISSION_TREE_CHANGED_EVENT, {
            detail: { permissions: { ...this.permissionTreePermissions } },
        }));
    }

    private readonly handlePermissionTreeBadgeClick = async (event: MouseEvent) => {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>(`.${PERMISSION_TREE_BADGE_CLASS}`)
            : null;
        if (!target) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (target.dataset.saving === "true") return;

        const notebookId = target.dataset.notebookId?.trim() ?? "";
        if (!notebookId) return;

        const previousPermissions = { ...this.permissionTreePermissions };
        const currentPermission = this.permissionTreePermissions[notebookId] ?? "r";
        this.permissionTreePermissions = {
            ...this.permissionTreePermissions,
            [notebookId]: getNextNotebookPermission(currentPermission),
        };
        target.dataset.saving = "true";
        target.setAttribute("aria-busy", "true");
        decoratePermissionTree(document, this.permissionTreePermissions, this.getPermissionTreeLabels());

        try {
            await this.saveData("notebookPermissions", this.permissionTreePermissions);
            this.emitPermissionTreeChange();
        } catch (error) {
            this.permissionTreePermissions = previousPermissions;
            decoratePermissionTree(document, this.permissionTreePermissions, this.getPermissionTreeLabels());
            console.error("[MCP] failed to update notebook permission from file tree:", error);
            showMessage(this.i18n?.permission_tree_save_failed || "权限保存失败，已恢复原状态");
        } finally {
            delete target.dataset.saving;
            target.removeAttribute("aria-busy");
        }
    };

    private readonly handlePermissionTreeWebSocket = (event: CustomEvent<{ cmd?: string }>) => {
        if (event?.detail?.cmd === "reloadFiletree") {
            void this.loadPermissionTreePermissions();
        }
    };

    private enableRecentDocumentsFeature() {
        appendHttpLifecycleLog("[recent-documents] enable feature");
        this.registerVersionControlIcon();
        this.registerRecentDocumentsDock();
        this.registerRecentDocumentsEvents();
        if (this.recentDocumentsDockElement && !this.recentDocumentsPanel) {
            this.mountRecentDocumentsPanel(this.recentDocumentsDockElement);
        }
    }

    private disableRecentDocumentsFeature() {
        appendHttpLifecycleLog("[recent-documents] disable feature");
        this.unregisterRecentDocumentsEvents();
        this.unmountRecentDocumentsDock();
        this.removeRecentDocumentsDock();
    }

    private registerRecentDocumentsDock() {
        if (!this.versionControlSettingsLoaded || !this.versionControlSettings.recentDocumentsEnabled) return;
        if (this.recentDocumentsDockRegistered) {
            if (this.isDockRegistrationAlive(
                RECENT_DOCUMENTS_DOCK_POSITION,
                this.getRecentDocumentsDockTypes(),
                this.recentDocumentsDockElement,
            )) return;
            appendHttpLifecycleLog("[recent-documents] dock registration stale; re-register");
            const dockTypes = this.getRecentDocumentsDockTypes();
            this.unmountRecentDocumentsDock();
            this.removeVersionControlDockButtons(dockTypes, RECENT_DOCUMENTS_DOCK_TYPE, RECENT_DOCUMENTS_ICON_ID);
            this.recentDocumentsDockRegistered = false;
            this.recentDocumentsDockRegistration = null;
            this.recentDocumentsDockRegisteredType = "";
        }

        const addDock = (this as any).addDock;
        if (typeof addDock !== "function") return;
        const registration = addDock.call(this, {
            config: {
                position: RECENT_DOCUMENTS_DOCK_POSITION,
                size: { width: 340, height: 0 },
                icon: RECENT_DOCUMENTS_ICON_ID,
                title: this.i18n?.recent_documents_dock_title || "最近更新",
                show: this.getInitialDockVisibility(
                    RECENT_DOCUMENTS_DOCK_POSITION,
                    this.getRecentDocumentsDockTypes(),
                    false,
                ),
            },
            data: {},
            type: RECENT_DOCUMENTS_DOCK_TYPE,
            init: (dock: any) => {
                const element = dock?.element as HTMLElement | undefined;
                if (!element) return;
                this.recentDocumentsDockElement = element;
                this.mountRecentDocumentsPanel(element);
            },
            update: () => this.invalidateRecentDocuments(),
            destroy: () => this.unmountRecentDocumentsDock(),
        });
        this.recentDocumentsDockRegistered = true;
        this.recentDocumentsDockRegistration = registration ?? null;
        this.recentDocumentsDockRegisteredType = this.getRegisteredDockType(registration, RECENT_DOCUMENTS_DOCK_TYPE);
    }

    private mountRecentDocumentsPanel(element: HTMLElement) {
        if (!this.versionControlSettings.recentDocumentsEnabled || !this.versionControlSettingsLoaded) return;
        this.unmountRecentDocumentsPanel();
        element.innerHTML = `<div id="${RECENT_DOCUMENTS_DOCK_ROOT_ID}" style="height: 100%;"></div>`;
        this.recentDocumentsContainer = element.querySelector(`#${RECENT_DOCUMENTS_DOCK_ROOT_ID}`);
        if (!this.recentDocumentsContainer) return;
        this.recentDocumentsPanel = new RecentDocumentsPanel({
            target: this.recentDocumentsContainer,
            props: {
                i18n: this.i18n ?? {},
                refreshVersion: this.recentDocumentsRefreshVersion,
                comparisonSummaries: this.recentDocumentDiffSummaries,
                activeDocumentId: this.recentHistorySelection?.documentId ?? "",
                onOpenDocument: (document: RecentDocumentView) => this.openRecentDocument(document),
                onOpenParentDocument: (folder: RecentDocumentFolderUnit) => this.openRecentParentDocument(folder),
                onComparisonSummary: (documentId: string, summary: RecentDocumentDiffSummary) => {
                    this.updateRecentDocumentDiffSummary(documentId, summary);
                },
            },
        });
    }

    private openRecentDocument(document: RecentDocumentView) {
        if (!document.id) return;
        this.compareRecentForDocument({ id: document.id, title: document.title }, document.updated);
        void (siyuanApi as any).openTab({
            app: (this as any).app,
            doc: { id: document.id },
            keepCursor: false,
            openNewTab: false,
        });
    }

    private openRecentParentDocument(folder: RecentDocumentFolderUnit) {
        if (!folder.parentDocumentId) return;
        void (siyuanApi as any).openTab({
            app: (this as any).app,
            doc: { id: folder.parentDocumentId },
            keepCursor: false,
            openNewTab: false,
        });
    }

    private compareRecentForDocument(context: CurrentDocumentContext, updated = "") {
        if (!context.id) return;
        this.currentDocument = context;
        this.timelineSelection = null;
        this.recentHistorySelection = {
            source: "recent_history",
            documentId: context.id,
            documentTitle: context.title,
            updated,
        };
        this.snapshotPanel?.$set({
            currentDocumentId: context.id,
            currentDocumentTitle: context.title,
            selectedNodeKey: "",
        });
        this.diffPanel?.$set({
            currentDocumentId: context.id,
            currentDocumentTitle: context.title,
            selection: this.recentHistorySelection,
        });
        this.recentDocumentsPanel?.$set({ activeDocumentId: context.id });
        this.showDiffDock();
    }

    private updateRecentDocumentDiffSummary(documentId: string, summary: RecentDocumentDiffSummary) {
        this.recentDocumentDiffSummaries = {
            ...this.recentDocumentDiffSummaries,
            [documentId]: summary,
        };
        this.recentDocumentsPanel?.$set({ comparisonSummaries: this.recentDocumentDiffSummaries });
    }

    private invalidateRecentDocuments() {
        this.recentDocumentsRefreshVersion += 1;
        this.recentDocumentsPanel?.$set({ refreshVersion: this.recentDocumentsRefreshVersion });
    }

    private registerRecentDocumentsEvents() {
        if (this.recentDocumentsEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        if (typeof eventBus?.on !== "function") return;
        eventBus.on("ws-main", this.handleRecentDocumentsWebSocket as any);
        this.recentDocumentsEventsRegistered = true;
    }

    private unregisterRecentDocumentsEvents() {
        if (this.recentDocumentsInvalidationTimer !== null) {
            clearTimeout(this.recentDocumentsInvalidationTimer);
            this.recentDocumentsInvalidationTimer = null;
        }
        if (!this.recentDocumentsEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        eventBus?.off?.("ws-main", this.handleRecentDocumentsWebSocket as any);
        this.recentDocumentsEventsRegistered = false;
    }

    private readonly handleRecentDocumentsWebSocket = (event: CustomEvent<{ cmd?: string }>) => {
        const cmd = event?.detail?.cmd;
        if (!cmd || !RECENT_DOCUMENTS_INVALIDATION_COMMANDS.has(cmd)) return;
        if (cmd !== "transactions") {
            this.invalidateRecentDocuments();
            return;
        }
        if (this.recentDocumentsInvalidationTimer !== null) {
            clearTimeout(this.recentDocumentsInvalidationTimer);
        }
        this.recentDocumentsInvalidationTimer = setTimeout(() => {
            this.recentDocumentsInvalidationTimer = null;
            this.invalidateRecentDocuments();
        }, 750);
    };

    private unmountRecentDocumentsPanel() {
        this.recentDocumentsPanel?.$destroy();
        this.recentDocumentsPanel = null;
        if (this.recentDocumentsContainer) this.recentDocumentsContainer.innerHTML = "";
        this.recentDocumentsContainer = null;
    }

    private unmountRecentDocumentsDock() {
        this.unmountRecentDocumentsPanel();
        this.recentDocumentsDockElement = null;
    }

    private removeRecentDocumentsDock() {
        const dockTypes = this.getRecentDocumentsDockTypes();
        const layout = (window as any)?.siyuan?.layout;
        this.removeDockFromPosition(layout, RECENT_DOCUMENTS_DOCK_POSITION, dockTypes);
        this.removeVersionControlDockRegistry(dockTypes, layout);
        this.removeVersionControlDockLayout(dockTypes);
        this.removeVersionControlDockButtons(dockTypes, RECENT_DOCUMENTS_DOCK_TYPE, RECENT_DOCUMENTS_ICON_ID);
        this.recentDocumentsDockRegistered = false;
        this.recentDocumentsDockRegistration = null;
        this.recentDocumentsDockRegisteredType = "";
    }

    private enableVersionControlFeature() {
        appendHttpLifecycleLog("[timeline] enable feature");
        const activeDocument = this.getActiveDocumentContext();
        if (activeDocument) this.currentDocument = activeDocument;
        this.registerVersionControlIcon();
        this.registerVersionControlCommand();
        this.registerVersionControlDocks();
        this.registerVersionControlEvents();
        this.ensureVersionControlPanelsMounted();
        this.snapshotPanel?.$set({
            showDebugMeta: this.versionControlSettings.showDebugMeta,
        });
        this.diffPanel?.$set({
            showDebugMeta: this.versionControlSettings.showDebugMeta,
        });
    }

    private disableVersionControlFeature() {
        appendHttpLifecycleLog("[timeline] disable feature");
        this.unregisterVersionControlEvents();
        this.timelineSelection = null;
        this.unmountVersionControlPanels();
        this.removeVersionControlDocks();
    }

    private registerVersionControlIcon() {
        if (this.versionControlIconRegistered) return;
        const addIcons = (this as any).addIcons;
        if (typeof addIcons !== "function") return;
        addIcons.call(this, VERSION_CONTROL_ICON_SYMBOLS);
        this.versionControlIconRegistered = true;
    }

    private registerVersionControlCommand() {
        if (!this.versionControlSettingsLoaded) return;
        if (this.versionControlCommandRegistered) return;
        const addCommand = (this as any).addCommand;
        if (typeof addCommand !== "function") return;
        addCommand.call(this, {
            langKey: "openSnapshotVersionControl",
            langText: this.i18n?.timeline_open_command || "打开文档快照",
            hotkey: "",
            callback: () => this.openVersionControl(),
            editorCallback: (protyle: any) => this.openVersionControl(protyle),
        });
        this.versionControlCommandRegistered = true;
    }

    private registerVersionControlDocks() {
        if (!this.versionControlSettingsLoaded || !this.versionControlSettings.enabled) return;
        this.registerSnapshotDock();
        this.registerDiffDock();
    }

    private registerSnapshotDock() {
        if (this.snapshotDockRegistered) {
            if (this.isDockRegistrationAlive(
                SNAPSHOT_DOCK_POSITION,
                this.getSnapshotDockTypes(),
                this.snapshotDockElement,
            )) return;
            appendHttpLifecycleLog("[timeline] snapshot dock registration stale; re-register");
            const dockTypes = this.getSnapshotDockTypes();
            this.unmountSnapshotDock();
            this.removeVersionControlDockButtons(dockTypes, SNAPSHOT_DOCK_TYPE, SNAPSHOT_ICON_ID);
            this.snapshotDockRegistered = false;
            this.snapshotDockRegistration = null;
            this.snapshotDockRegisteredType = "";
        }

        const addDock = (this as any).addDock;
        if (typeof addDock !== "function") return;
        const registration = addDock.call(this, {
            config: {
                position: SNAPSHOT_DOCK_POSITION,
                size: { width: 320, height: 0 },
                icon: SNAPSHOT_ICON_ID,
                title: this.i18n?.snapshot_dock_title || "文档快照",
                show: this.getInitialDockVisibility(SNAPSHOT_DOCK_POSITION, this.getSnapshotDockTypes(), true),
            },
            data: {},
            type: SNAPSHOT_DOCK_TYPE,
            init: (dock: any) => {
                const element = dock?.element as HTMLElement | undefined;
                if (!element) return;
                this.snapshotDockElement = element;
                this.mountSnapshotPanel(element);
            },
            update: () => this.updateVersionControlDocument(this.currentDocument, { force: true }),
            destroy: () => this.unmountSnapshotDock(),
        });
        this.snapshotDockRegistered = true;
        this.snapshotDockRegistration = registration ?? null;
        this.snapshotDockRegisteredType = this.getRegisteredDockType(registration, SNAPSHOT_DOCK_TYPE);
    }

    private registerDiffDock() {
        if (this.diffDockRegistered) {
            if (this.isDockRegistrationAlive(
                VERSION_CONTROL_DOCK_POSITION,
                this.getDiffDockTypes(),
                this.diffDockElement,
            )) return;
            appendHttpLifecycleLog("[timeline] diff dock registration stale; re-register");
            const dockTypes = this.getDiffDockTypes();
            this.unmountDiffDock();
            this.removeVersionControlDockButtons(dockTypes, VERSION_CONTROL_DOCK_TYPE, VERSION_CONTROL_ICON_ID);
            this.diffDockRegistered = false;
            this.diffDockRegistration = null;
            this.diffDockRegisteredType = "";
        }

        const addDock = (this as any).addDock;
        if (typeof addDock !== "function") return;
        const registration = addDock.call(this, {
            config: {
                position: VERSION_CONTROL_DOCK_POSITION,
                size: { width: 720, height: 0 },
                icon: VERSION_CONTROL_ICON_ID,
                title: this.i18n?.diff_dock_title || "文档 Diff",
                show: this.getInitialDockVisibility(VERSION_CONTROL_DOCK_POSITION, this.getDiffDockTypes(), false),
            },
            data: {},
            type: VERSION_CONTROL_DOCK_TYPE,
            init: (dock: any) => {
                const element = dock?.element as HTMLElement | undefined;
                if (!element) return;
                this.diffDockElement = element;
                this.mountDiffPanel(element);
            },
            update: () => this.updateVersionControlDocument(this.currentDocument, { force: true }),
            destroy: () => this.unmountDiffDock(),
        });
        this.diffDockRegistered = true;
        this.diffDockRegistration = registration ?? null;
        this.diffDockRegisteredType = this.getRegisteredDockType(registration, VERSION_CONTROL_DOCK_TYPE);
    }

    private getRegisteredDockType(registration: { config?: any; model?: any } | null, type: string): string {
        return firstNonEmptyString([
            registration?.config?.type,
            registration?.model?.type,
            this.name ? `${this.name}${type}` : "",
            type,
        ]);
    }

    private getInitialDockVisibility(position: string, dockTypes: string[], fallback: boolean): boolean {
        const dockLayout = (window as any)?.siyuan?.config?.uiLayout?.[getDockLayoutKey(position)];
        if (!Array.isArray(dockLayout?.data)) return fallback;
        for (const group of dockLayout.data) {
            if (!Array.isArray(group)) continue;
            const item = group.find((entry) => dockTypes.includes(entry?.type));
            if (typeof item?.show === "boolean") return item.show;
        }
        return fallback;
    }

    private isDockRegistrationAlive(position: string, dockTypes: string[], element: HTMLElement | null): boolean {
        if (element?.isConnected) return true;
        if (dockTypes.length === 0) return false;

        const layout = (window as any)?.siyuan?.layout;
        const targetDock = getDockByPosition(layout, position);
        const dockData = targetDock?.data;
        if (dockData && typeof dockData === "object") {
            for (const dockType of dockTypes) {
                if (Object.prototype.hasOwnProperty.call(dockData, dockType)) return true;
            }
        }

        const uiLayout = (window as any)?.siyuan?.config?.uiLayout;
        const dockLayout = uiLayout?.[getDockLayoutKey(position)];
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

    private ensureVersionControlPanelsMounted() {
        if (!this.snapshotPanel && this.snapshotDockElement) this.mountSnapshotPanel(this.snapshotDockElement);
        if (!this.diffPanel && this.diffDockElement) this.mountDiffPanel(this.diffDockElement);
    }

    private mountSnapshotPanel(element: HTMLElement) {
        if (!this.versionControlSettings.enabled) return;
        if (!this.versionControlSettingsLoaded) return;
        this.unmountSnapshotPanel();
        element.innerHTML = `<div id="${SNAPSHOT_DOCK_ROOT_ID}" style="height: 100%;"></div>`;
        this.snapshotContainer = element.querySelector(`#${SNAPSHOT_DOCK_ROOT_ID}`);
        if (!this.snapshotContainer) return;
        this.snapshotPanel = new SnapshotPanel({
            target: this.snapshotContainer,
            props: {
                currentDocumentId: this.currentDocument.id,
                currentDocumentTitle: this.currentDocument.title,
                selectedNodeKey: getTimelineNodeSelectionKey(this.timelineSelection),
                showDebugMeta: this.versionControlSettings.showDebugMeta,
                i18n: this.i18n ?? {},
                onSelectNode: (selection: TimelineNodeSelection | null) => this.selectTimelineNode(selection),
            },
        });
    }

    private mountDiffPanel(element: HTMLElement) {
        if (!this.versionControlSettings.enabled || !this.versionControlSettingsLoaded) return;
        this.unmountDiffPanel();
        element.innerHTML = `<div id="${VERSION_CONTROL_DOCK_ROOT_ID}" style="height: 100%;"></div>`;
        this.diffContainer = element.querySelector(`#${VERSION_CONTROL_DOCK_ROOT_ID}`);
        if (!this.diffContainer) return;
        this.diffPanel = new VersionDiffPanel({
            target: this.diffContainer,
            props: {
                currentDocumentId: this.currentDocument.id,
                currentDocumentTitle: this.currentDocument.title,
                selection: this.getActiveDiffSelection(),
                showDebugMeta: this.versionControlSettings.showDebugMeta,
                i18n: this.i18n ?? {},
                onOpenSnapshot: () => this.showSnapshotDock(),
                onCompareRecent: () => this.compareRecentForDocument(this.currentDocument),
                onComparisonSummary: (documentId: string, summary: RecentDocumentDiffSummary) => {
                    this.updateRecentDocumentDiffSummary(documentId, summary);
                },
            },
        });
    }

    private getActiveDiffSelection(): DocumentDiffSelection | null {
        return this.recentHistorySelection ?? this.timelineSelection;
    }

    private registerVersionControlEvents() {
        if (!this.versionControlSettingsLoaded) return;
        if (!this.versionControlSettings.enabled || this.versionControlEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        if (typeof eventBus?.on !== "function") return;
        eventBus.on("switch-protyle", this.handleVersionControlProtyleChange as any);
        eventBus.on("loaded-protyle-dynamic", this.handleVersionControlProtyleChange as any);
        eventBus.on("loaded-protyle-static", this.handleVersionControlProtyleChange as any);
        eventBus.on("open-menu-doctree", this.handleVersionControlDocTreeMenu as any);
        this.versionControlEventsRegistered = true;
    }

    private unregisterVersionControlEvents() {
        if (!this.versionControlEventsRegistered) return;
        const eventBus = (this as any).eventBus;
        eventBus?.off?.("switch-protyle", this.handleVersionControlProtyleChange as any);
        eventBus?.off?.("loaded-protyle-dynamic", this.handleVersionControlProtyleChange as any);
        eventBus?.off?.("loaded-protyle-static", this.handleVersionControlProtyleChange as any);
        eventBus?.off?.("open-menu-doctree", this.handleVersionControlDocTreeMenu as any);
        this.versionControlEventsRegistered = false;
    }

    private readonly handleVersionControlProtyleChange = (event: CustomEvent<{ protyle?: unknown }>) => {
        if (!this.versionControlSettings.enabled) return;
        const context = this.getDocumentContextFromProtyle(event?.detail?.protyle);
        if (context) this.updateVersionControlDocument(context);
    };

    private readonly handleVersionControlDocTreeMenu = (event: CustomEvent<{
        type?: string;
        elements?: HTMLElement[];
        menu?: { addItem?: (item: Record<string, unknown>) => unknown };
    }>) => {
        if (!this.versionControlSettings.enabled) return;
        if (event?.detail?.type !== "doc" && event?.detail?.type !== "docs") return;
        const elements = Array.isArray(event.detail.elements) ? event.detail.elements : [];
        if (elements.length !== 1 || typeof event.detail.menu?.addItem !== "function") return;
        const element = elements[0];
        const id = firstNonEmptyString([
            element?.dataset?.nodeId,
            element?.getAttribute?.("data-node-id"),
        ]);
        if (!id) return;
        const title = firstNonEmptyString([
            element.querySelector?.(".b3-list-item__text")?.textContent,
            element.getAttribute?.("aria-label"),
            id,
        ]);
        event.detail.menu.addItem({
            id: "sisyphusCompareRecentHistory",
            icon: VERSION_CONTROL_ICON_ID,
            label: this.i18n?.recent_history_doc_tree_action || "查看最近历史差异",
            click: () => {
                const context = { id, title };
                this.compareRecentForDocument(context);
                void (siyuanApi as any).openTab({
                    app: (this as any).app,
                    doc: { id },
                    keepCursor: false,
                    openNewTab: false,
                });
            },
        });
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

    private getActiveDocumentContext(): CurrentDocumentContext | null {
        if (typeof getAllEditor !== "function") return null;
        const editors = getAllEditor();
        if (!Array.isArray(editors) || editors.length === 0) return null;
        const visibleEditors = editors.filter((editor: any) => {
            const element = editor?.protyle?.element as HTMLElement | undefined;
            if (!element?.isConnected) return false;
            if (typeof getComputedStyle !== "function") return true;
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden";
        });
        const activeEditor = visibleEditors.find((editor: any) => (
            editor?.protyle?.element?.closest?.(".layout__wnd--active")
        )) ?? visibleEditors.at(-1) ?? editors.at(-1);
        return this.getDocumentContextFromProtyle(activeEditor?.protyle ?? activeEditor);
    }

    private updateVersionControlDocument(context: CurrentDocumentContext, options: { force?: boolean } = {}) {
        if (!this.versionControlSettings.enabled) return;
        const documentChanged = this.currentDocument.id !== context.id;
        this.currentDocument = context;
        if (documentChanged) {
            this.timelineSelection = null;
            this.recentHistorySelection = null;
        }
        void options;
        this.snapshotPanel?.$set({
            currentDocumentId: context.id,
            currentDocumentTitle: context.title,
            selectedNodeKey: getTimelineNodeSelectionKey(this.timelineSelection),
        });
        this.diffPanel?.$set({
            currentDocumentId: context.id,
            currentDocumentTitle: context.title,
            selection: this.getActiveDiffSelection(),
        });
        this.recentDocumentsPanel?.$set({ activeDocumentId: this.recentHistorySelection?.documentId ?? "" });
    }

    private selectTimelineNode(selection: TimelineNodeSelection | null) {
        if (selection && selection.documentId !== this.currentDocument.id) return;
        this.timelineSelection = selection;
        this.recentHistorySelection = null;
        this.recentDocumentsPanel?.$set({ activeDocumentId: "" });
        this.snapshotPanel?.$set({
            selectedNodeKey: getTimelineNodeSelectionKey(selection),
        });
        this.diffPanel?.$set({
            currentDocumentId: this.currentDocument.id,
            currentDocumentTitle: this.currentDocument.title,
            selection,
        });
        if (selection) this.showDiffDock();
    }

    private showSnapshotDock() {
        if (!this.versionControlSettings.enabled) return;
        const layout = (window as any)?.siyuan?.layout;
        const targetDock = getDockByPosition(layout, SNAPSHOT_DOCK_POSITION);
        if (typeof targetDock?.toggleModel === "function") {
            targetDock.toggleModel(this.getSnapshotDockTypes()[0] ?? SNAPSHOT_DOCK_TYPE, true, false, false, true);
            return;
        }
        targetDock?.showDock?.();
    }

    private showDiffDock() {
        if (!this.versionControlSettings.enabled) return;
        const layout = (window as any)?.siyuan?.layout;
        const targetDock = getDockByPosition(layout, VERSION_CONTROL_DOCK_POSITION);
        if (typeof targetDock?.toggleModel === "function") {
            targetDock.toggleModel(this.getDiffDockTypes()[0] ?? VERSION_CONTROL_DOCK_TYPE, true, false, false, true);
            return;
        }
        targetDock?.showDock?.();
    }

    private unmountSnapshotPanel() {
        this.snapshotPanel?.$destroy();
        this.snapshotPanel = null;
        if (this.snapshotContainer) this.snapshotContainer.innerHTML = "";
        this.snapshotContainer = null;
    }

    private unmountDiffPanel() {
        this.diffPanel?.$destroy();
        this.diffPanel = null;
        if (this.diffContainer) this.diffContainer.innerHTML = "";
        this.diffContainer = null;
    }

    private unmountVersionControlPanels() {
        this.unmountSnapshotPanel();
        this.unmountDiffPanel();
    }

    private unmountSnapshotDock() {
        this.unmountSnapshotPanel();
        this.snapshotDockElement = null;
    }

    private unmountDiffDock() {
        this.unmountDiffPanel();
        this.diffDockElement = null;
    }

    private unmountVersionControlDocks() {
        this.unmountSnapshotDock();
        this.unmountDiffDock();
    }

    private removeVersionControlDocks() {
        appendHttpLifecycleLog("[timeline] remove docks");
        const layout = (window as any)?.siyuan?.layout;
        const snapshotTypes = this.getSnapshotDockTypes();
        const diffTypes = this.getDiffDockTypes();
        this.removeDockFromPosition(layout, SNAPSHOT_DOCK_POSITION, snapshotTypes);
        this.removeDockFromPosition(layout, VERSION_CONTROL_DOCK_POSITION, diffTypes);
        const allTypes = [...new Set([...snapshotTypes, ...diffTypes])];
        this.removeVersionControlDockRegistry(allTypes, layout);
        this.removeVersionControlDockLayout(allTypes);
        this.removeVersionControlDockButtons(snapshotTypes, SNAPSHOT_DOCK_TYPE, SNAPSHOT_ICON_ID);
        this.removeVersionControlDockButtons(diffTypes, VERSION_CONTROL_DOCK_TYPE, VERSION_CONTROL_ICON_ID);
        this.snapshotDockRegistered = false;
        this.diffDockRegistered = false;
        this.snapshotDockElement = null;
        this.diffDockElement = null;
        this.snapshotDockRegistration = null;
        this.diffDockRegistration = null;
        this.snapshotDockRegisteredType = "";
        this.diffDockRegisteredType = "";
    }

    private removeDockFromPosition(layout: any, position: string, dockTypes: string[]) {
        const targetDock = getDockByPosition(layout, position);
        for (const dockType of dockTypes) {
            targetDock?.toggleModel?.(dockType, false, true, true, true);
            targetDock?.remove?.(dockType);
        }
    }

    private getSnapshotDockTypes(): string[] {
        return this.getDockTypes(this.snapshotDockRegistration, this.snapshotDockRegisteredType, SNAPSHOT_DOCK_TYPE);
    }

    private getDiffDockTypes(): string[] {
        return this.getDockTypes(this.diffDockRegistration, this.diffDockRegisteredType, VERSION_CONTROL_DOCK_TYPE);
    }

    private getRecentDocumentsDockTypes(): string[] {
        return this.getDockTypes(
            this.recentDocumentsDockRegistration,
            this.recentDocumentsDockRegisteredType,
            RECENT_DOCUMENTS_DOCK_TYPE,
        );
    }

    private getDockTypes(
        registration: { config?: any; model?: any } | null,
        registeredType: string,
        fallbackType: string,
    ): string[] {
        return [
            registration?.config?.type,
            registration?.model?.type,
            registeredType,
            this.name ? `${this.name}${fallbackType}` : "",
            fallbackType,
        ].filter((value, index, values): value is string => (
            typeof value === "string" && value.length > 0 && values.indexOf(value) === index
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

    private removeVersionControlDockButtons(dockTypes: string[], fallbackType: string, iconId: string) {
        if (typeof document === "undefined") return;
        for (const dockType of dockTypes) {
            const escapedDockType = escapeCssAttributeValue(dockType);
            const selectors = [
                `.dock__item[data-type="${escapedDockType}"]`,
                `.dock__item[data-id="${escapedDockType}"]`,
                `[data-type="${escapedDockType}"].dock__item`,
                `[data-id="${escapedDockType}"].dock__item`,
                `.dock__item[data-type$="${escapeCssAttributeValue(fallbackType)}"]`,
                `.dock__item[data-id$="${escapeCssAttributeValue(fallbackType)}"]`,
            ];
            for (const element of Array.from(document.querySelectorAll<HTMLElement>(selectors.join(", ")))) {
                const dockItem = element.closest?.(".dock__item") as HTMLElement | null;
                (dockItem ?? element).remove();
            }
        }

        const escapedIconId = escapeCssAttributeValue(`#${iconId}`);
        const iconSelectors = [
            `.dock__item[data-icon="${escapeCssAttributeValue(iconId)}"]`,
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

function getDockLayoutKey(position: string): "left" | "right" | "bottom" {
    if (position.startsWith("Left")) return "left";
    if (position.startsWith("Bottom")) return "bottom";
    return "right";
}

function escapeCssAttributeValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
