import { HttpServerLauncher } from "../../server-launcher";
import type { HttpServerSettings } from "../setting/tool-config-storage";
import { mdtxInterpreterCandidates, type InterpreterIO, type MdtxInterpreter } from "./mdtx-interpreter";

export { mdtxInterpreterCandidates, parseShebang, siblingPythonNames } from "./mdtx-interpreter";
export type { InterpreterIO, MdtxInterpreter, ShebangResolution } from "./mdtx-interpreter";

export interface TranslationProgress {
    stage: string;
    completed?: number;
    total?: number;
    unit?: string;
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
                        && (event.total === undefined || Number.isInteger(event.total) && event.total > 0 && event.completed <= event.total)
                        && (event.unit === undefined || typeof event.unit === "string" && event.unit.length <= 8)) onProgress?.(event);
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

function nodeIO(): InterpreterIO {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    return {
        pathEnv: process.env.PATH ?? "",
        delimiter: path.delimiter,
        platform: process.platform,
        exists: target => fs.existsSync(target),
        isFile: target => { try { return fs.statSync(target).isFile(); } catch { return false; } },
        readHead: target => { try { return fs.readFileSync(target, "utf8").slice(0, 4096); } catch { return ""; } },
        join: (...parts) => path.join(...parts),
        dirname: target => path.dirname(target),
    };
}

interface BridgeReply { ok?: boolean; error?: string; [key: string]: unknown }

/**
 * 通过 mdtx 自身的 Python 环境运行 mdtx-config-bridge.py。
 * 密钥只经 stdin JSON 传递，不出现在命令行或日志中。
 */
export async function runMdtxBridge<T = Record<string, unknown>>(
    pluginName: string,
    executable: string,
    configPath: string,
    command: string,
    payload: Record<string, unknown> = {},
    options: { timeoutMs?: number; cwd?: string; env?: Record<string, string> } = {},
): Promise<T> {
    const server = HttpServerLauncher.resolveServerScriptPath(pluginName);
    if (!server) throw new Error("请在思源桌面客户端运行 mdtx 配置桥接。");
    const { spawn } = require("child_process") as typeof import("child_process");
    const path = require("path") as typeof import("path");
    const os = require("os") as typeof import("os");
    const fs = require("fs") as typeof import("fs");
    const bridge = path.join(path.dirname(server), "literature-scripts", "mdtx-config-bridge.py");
    if (!fs.existsSync(bridge)) throw new Error("mdtx 配置桥接脚本缺失，请重新构建插件。");
    const candidates = mdtxInterpreterCandidates(executable, nodeIO());
    if (!candidates.length) {
        throw new Error("无法确定所选 mdtx 的 Python 解释器，它可能不是可读取配置的 Python 安装版本。");
    }
    const cwd = options.cwd ?? os.homedir();
    const timeoutMs = options.timeoutMs ?? 20_000;
    const request = JSON.stringify({ command, configPath, ...payload });
    let lastFailure = "";
    for (const candidate of candidates.slice(0, 4)) {
        const outcome = await new Promise<{ reply?: BridgeReply; spawnError?: boolean; failure?: string }>(resolve => {
            let child;
            try {
                child = spawn(candidate.command, [...candidate.args, bridge], {
                    cwd, env: { ...process.env, ...(options.env ?? {}) },
                    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
                });
            } catch { resolve({ spawnError: true }); return; }
            let stdout = "", stderr = "", settled = false;
            const finish = (value: { reply?: BridgeReply; spawnError?: boolean; failure?: string }) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            };
            const timer = setTimeout(() => {
                try { child.kill(); } catch { /* 进程可能已退出。 */ }
                finish({ failure: "mdtx 配置桥接超时，请检查所选 mdtx 环境。" });
            }, timeoutMs);
            child.on("error", () => finish({ spawnError: true }));
            child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; if (stdout.length > 1_000_000) child.kill(); });
            child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-8000); });
            child.on("close", code => {
                const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
                try {
                    const reply = JSON.parse(line) as BridgeReply;
                    if (code === 0 && reply && typeof reply === "object" && "ok" in reply) {
                        finish({ reply });
                        return;
                    }
                } catch { /* 转交统一错误。 */ }
                finish({ failure: (stderr.trim() || (code ? `mdtx 配置桥接退出码 ${code}` : "未收到 mdtx 配置桥接回执。")).slice(-2000) });
            });
            child.stdin.on("error", () => { /* 子进程失败由退出事件报告。 */ });
            child.stdin.end(request);
        });
        if (outcome.reply) {
            const reply = outcome.reply;
            if (reply.ok === true) return reply as T;
            const message = typeof reply.error === "string" && reply.error.trim() ? reply.error.trim() : "mdtx 配置桥接失败。";
            throw new Error(message);
        }
        if (outcome.failure) {
            lastFailure = outcome.failure;
            // 解释器存在但桥接失败（如模块缺失）时不再尝试下一个候选。
            if (!/ENOENT|not found|spawn/i.test(outcome.failure)) throw new Error(outcome.failure);
            continue;
        }
        // spawnError：候选解释器不可执行，尝试下一个。
    }
    throw new Error(lastFailure || "无法启动所选 mdtx 的 Python 环境，它可能不是可读取配置的 Python 安装版本。");
}
