import { describe, expect, it } from "vitest";
import {
    mdtxInterpreterCandidates, parseShebang, siblingPythonNames, type InterpreterIO,
} from "@/ui/literature/mdtx-interpreter";

function fakeIO(files: Record<string, string>, pathEnv = "", platform = "darwin"): InterpreterIO {
    const map = new Map(Object.entries(files));
    return {
        pathEnv,
        delimiter: platform === "win32" ? ";" : ":",
        platform,
        exists: (path: string) => map.has(path),
        isFile: (path: string) => map.has(path),
        readHead: (path: string) => map.get(path) ?? "",
        join: (...parts: string[]) => parts.filter(Boolean).join("/"),
        dirname: (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))),
    };
}

describe("mdtx 解释器解析", () => {
    it("解析直接与 env 形式的 shebang", () => {
        expect(parseShebang("#!/opt/venv/bin/python")).toEqual({ command: "/opt/venv/bin/python", args: [] });
        expect(parseShebang("#!/usr/bin/env python3")).toEqual({ envName: "python3" });
        expect(parseShebang("#!/usr/bin/env -S python3 -u")).toEqual({ envName: "python3" });
        expect(parseShebang("#!/bin/sh -e")).toEqual({ command: "/bin/sh", args: ["-e"] });
        expect(parseShebang("not a shebang")).toBeNull();
        expect(parseShebang("#!")).toBeNull();
    });

    it("venv 可执行文件优先使用其 shebang 解释器", () => {
        const io = fakeIO({
            "/opt/mdtx/bin/mdtx": "#!/opt/mdtx/bin/python3\n",
            "/opt/mdtx/bin/python3": "binary",
            "/opt/mdtx/bin/python": "binary",
            "/usr/bin/python3": "binary",
        });
        const candidates = mdtxInterpreterCandidates("/opt/mdtx/bin/mdtx", io);
        expect(candidates[0]).toMatchObject({ command: "/opt/mdtx/bin/python3", via: "shebang" });
        expect(candidates.some(c => c.via === "sibling")).toBe(true);
    });

    it("env shebang 通过 PATH 查找解释器", () => {
        const io = fakeIO({
            "/opt/mdtx/bin/mdtx": "#!/usr/bin/env python3\n",
            "/usr/bin/python3": "binary",
            "/opt/mdtx/bin/python3": "binary",
        }, "/usr/bin:/opt/mdtx/bin");
        const candidates = mdtxInterpreterCandidates("/opt/mdtx/bin/mdtx", io);
        expect(candidates[0]).toMatchObject({ command: "/usr/bin/python3", via: "env shebang" });
    });

    it("无 shebang 时回退到同目录 python，并支持 PATH 上的裸命令名", () => {
        const io = fakeIO({
            "/venv/bin/mdtx": "console script without shebang",
            "/venv/bin/python": "binary",
        }, "/venv/bin");
        const candidates = mdtxInterpreterCandidates("mdtx", io);
        expect(candidates[0]).toMatchObject({ command: "/venv/bin/python", via: "sibling" });
        expect(siblingPythonNames("win32")).toContain("python.exe");
        expect(mdtxInterpreterCandidates("/nonexistent/mdtx", io)).toEqual([]);
    });
});
