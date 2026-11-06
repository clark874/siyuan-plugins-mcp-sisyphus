/** mdtx 可执行文件 → Python 桥接解释器的纯解析逻辑（不含 Node 依赖，便于单测）。 */

export interface MdtxInterpreter {
    command: string;
    args: string[];
    via: string;
}

export type ShebangResolution = { command: string; args: string[] } | { envName: string } | null;

/** 解析 `#!` 行；`/usr/bin/env python3` 形式返回待 PATH 查找的解释器名。 */
export function parseShebang(line: string): ShebangResolution {
    const match = /^#!\s*(.+)$/.exec(line.trim());
    if (!match) return null;
    const parts = match[1].trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const [command, ...args] = parts;
    if ((command.split(/[\\/]/).pop() ?? command) === "env") {
        for (const part of args) {
            if (part.startsWith("-") || part.includes("=")) continue;
            return { envName: part };
        }
        return null;
    }
    return { command, args };
}

export function siblingPythonNames(platform: string): string[] {
    return platform === "win32"
        ? ["python.exe", "python3.exe", "python.bat", "python3.bat", "python", "python3"]
        : ["python3", "python"];
}

export interface InterpreterIO {
    pathEnv: string;
    delimiter: string;
    platform: string;
    exists(path: string): boolean;
    isFile(path: string): boolean;
    readHead(path: string): string;
    join(...parts: string[]): string;
    dirname(path: string): string;
}

function searchPath(name: string, io: InterpreterIO, push: (command: string, args: string[], via: string) => void, via: string) {
    const names = io.platform === "win32" && !/\.[a-z]+$/i.test(name) ? [name + ".exe", name + ".bat", name] : [name];
    for (const dir of io.pathEnv.split(io.delimiter).filter(Boolean)) {
        for (const file of names) {
            const candidate = io.join(dir, file);
            if (io.exists(candidate)) {
                push(candidate, [], via);
                return;
            }
        }
    }
}

/**
 * 为 mdtx 可执行文件推导可运行 Python 桥接脚本的解释器候选，按优先级排列：
 * shebang 直挂解释器 → env shebang 的 PATH 解释器 → 可执行文件同目录的 python。
 */
export function mdtxInterpreterCandidates(executable: string, io: InterpreterIO): MdtxInterpreter[] {
    const candidates: MdtxInterpreter[] = [];
    const seen = new Set<string>();
    const push = (command: string, args: string[], via: string) => {
        const key = command + "" + args.join(" ");
        if (command && !seen.has(key)) { seen.add(key); candidates.push({ command, args, via }); }
    };

    let resolved = executable;
    const hasSeparator = /[\\/]/.test(executable) || /^[A-Za-z]:/.test(executable);
    if (!hasSeparator) {
        for (const dir of io.pathEnv.split(io.delimiter).filter(Boolean)) {
            const direct = io.join(dir, executable);
            if (io.exists(direct)) { resolved = direct; break; }
        }
    }
    if (io.exists(resolved) && io.isFile(resolved)) {
        const shebang = (io.readHead(resolved).split(/\r?\n/, 1)[0] ?? "").trim();
        const parsed = parseShebang(shebang);
        if (parsed && "command" in parsed) {
            push(parsed.command, parsed.args, "shebang");
        } else if (parsed && "envName" in parsed) {
            if (/[\\/]/.test(parsed.envName) || /^[A-Za-z]:/.test(parsed.envName)) {
                if (io.exists(parsed.envName)) push(parsed.envName, [], "env shebang");
            } else {
                searchPath(parsed.envName, io, push, "env shebang");
            }
        }
    }
    const dir = io.dirname(resolved || executable);
    for (const name of siblingPythonNames(io.platform)) {
        const sibling = io.join(dir, name);
        if (io.exists(sibling)) push(sibling, [], "sibling");
    }
    return candidates;
}
