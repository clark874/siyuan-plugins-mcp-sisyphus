import { HttpServerLauncher } from "../../server-launcher";
import type { HttpServerSettings } from "../setting/tool-config-storage";

export interface TranslationProgress {
    stage: string;
    completed?: number;
    total?: number;
    preservedCount?: number;
    done?: boolean;
}

export async function runLiteratureTask<T>(
    pluginName: string,
    http: HttpServerSettings,
    script: "translate-literature.mjs" | "ingest-literature-batch.mjs",
    args: string[],
    input: Record<string, unknown>,
    credentials: Record<string, string> = {},
    onProgress?: (progress: TranslationProgress) => void,
): Promise<T> {
    const server = HttpServerLauncher.resolveServerScriptPath(pluginName);
    if (!server) throw new Error("请在思源桌面客户端运行文献任务。");
    if (!http.enabled || http.tlsEnabled) throw new Error("本机文献任务需要启用 HTTP 连接。");
    const { dirname, join } = require("path") as typeof import("path");
    const { spawn } = require("child_process") as typeof import("child_process");
    const mcpSettings = { host: "127.0.0.1", port: http.port, authEnabled: http.authEnabled, token: http.token };
    return new Promise<T>((resolve, reject) => {
        const child = spawn(process.execPath, [join(dirname(server), "literature-scripts", script), ...args], {
            env: { ...process.env, ...credentials, ELECTRON_RUN_AS_NODE: "1" },
            stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
        });
        let output = "", errors = "", pending = "";
        child.stdout.setEncoding("utf8").on("data", chunk => {
            output += chunk;
            if (output.length > 4_000_000) child.kill();
        });
        child.stderr.setEncoding("utf8").on("data", chunk => {
            pending += chunk;
            const lines = pending.split("\n");
            pending = lines.pop().slice(-5000);
            for (const line of lines) {
                if (!line.startsWith("SISYPHUS_PROGRESS ")) { errors = (errors + line + "\n").slice(-5000); continue; }
                try {
                    const event = JSON.parse(line.slice("SISYPHUS_PROGRESS ".length)) as TranslationProgress;
                    if (typeof event.stage === "string" && event.stage.length < 120
                        && (event.completed === undefined || Number.isInteger(event.completed) && event.completed >= 0)
                        && (event.total === undefined || Number.isInteger(event.total) && event.total > 0 && event.completed <= event.total)) onProgress?.(event);
                } catch { /* 忽略不完整的进度消息。 */ }
            }
        });
        child.on("error", () => reject(new Error("无法启动本机文献任务。")));
        child.stdin.on("error", () => { /* 子进程失败由退出事件报告。 */ });
        child.on("close", code => {
            if (code === 0 && output.trim()) {
                try { resolve(JSON.parse(output) as T); return; }
                catch { /* 转交统一错误。 */ }
            }
            reject(new Error((errors + pending).trim() || (code ? "本机文献任务未完成。" : "未收到文献任务回执。")));
        });
        child.stdin.end(JSON.stringify({ ...input, mcpSettings }));
    });
}
