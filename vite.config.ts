import { resolve } from "path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import zipPack from "vite-plugin-zip-pack";
import fg from "fast-glob";

import vitePluginYamlI18n from "./yaml-plugin";

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === "inline";
const isDev = env.NODE_ENV === "development";

const outputDir = isDev ? "dev" : "dist";

const serverExternals = [
    "siyuan",
    "process",
    "path",
    "fs",
    "node:path",
    "node:fs",
    "child_process",
    "node:child_process",
    "node:http",
    "node:crypto",
    "http",
    "crypto",
    "stream",
    "node:stream",
    "http2",
    "node:http2",
    "url",
    "node:url",
    "buffer",
    "node:buffer",
    "events",
    "node:events",
    "net",
    "node:net",
    "tls",
    "node:tls",
    "zlib",
    "node:zlib",
    "querystring",
    "node:querystring",
];

const buildTarget = env.BUILD_TARGET === "server" ? "server" : "renderer";

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);
console.log("buildTarget=>", buildTarget);

export default defineConfig(buildTarget === "server"
    ? createServerConfig()
    : createRendererConfig());

function createRendererConfig() {
    return {
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
            },
        },
        plugins: [
            svelte(),
            vitePluginYamlI18n({
                inDir: "public/i18n",
                outDir: `${outputDir}/i18n`,
            }),
            viteStaticCopy({
                targets: [
                    { src: "./README*.md", dest: "./" },
                    { src: "./plugin.json", dest: "./" },
                    { src: "./preview.png", dest: "./" },
                    { src: "./icon.png", dest: "./" },
                ],
            }),
        ],
        define: {
            "process.env.DEV_MODE": JSON.stringify(isDev),
            "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
        },
        build: {
            outDir: outputDir,
            emptyOutDir: !isDev,
            minify: true,
            sourcemap: isSrcmap ? "inline" : false,
            lib: {
                entry: resolve(__dirname, "src/index.ts"),
                fileName: () => "index",
                formats: ["cjs"],
            },
            rollupOptions: {
                external: ["siyuan"],
                plugins: [
                    ...(isDev
                        ? [
                            {
                                name: "watch-external",
                                async buildStart() {
                                    const files = await fg([
                                        "public/i18n/**",
                                        "./README*.md",
                                        "./plugin.json",
                                    ]);
                                    for (const file of files) {
                                        this.addWatchFile(file);
                                    }
                                },
                            },
                        ]
                        : []),
                    assertNoLocalRequire("index.js"),
                ],
                output: {
                    inlineDynamicImports: true,
                    entryFileNames: "index.js",
                    assetFileNames: (assetInfo) => {
                        if (assetInfo.name === "style.css") {
                            return "index.css";
                        }
                        return assetInfo.name ?? "[name][extname]";
                    },
                },
            },
        },
    };
}

function createServerConfig() {
    return {
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
            },
        },
        define: {
            "process.env.DEV_MODE": JSON.stringify(isDev),
            "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
        },
        build: {
            outDir: outputDir,
            emptyOutDir: false,
            minify: true,
            sourcemap: isSrcmap ? "inline" : false,
            lib: {
                entry: resolve(__dirname, "src/mcp/server.ts"),
                fileName: () => "mcp-server",
                formats: ["cjs"],
            },
            rollupOptions: {
                external: serverExternals,
                plugins: [
                    ...(isDev
                        ? [
                            {
                                name: "remove-livereload-from-node",
                                enforce: "post" as const,
                                renderChunk(code, chunk) {
                                    const isMcpServer = chunk.name === "mcp-server";
                                    const hasLivereload = code.includes("livereload") && code.includes("self.document");

                                    if (isMcpServer || hasLivereload) {
                                        const livereloadPattern = /\(function\([^)]*\)\{[^}]*livereload[^}]*\}\)\(self\.document\);/g;
                                        const cleanedCode = code.replace(livereloadPattern, "");
                                        if (cleanedCode !== code) {
                                            console.log(`[remove-livereload] Removed livereload code from chunk: ${chunk.name || "unknown"}`);
                                        }
                                        return {
                                            code: cleanedCode,
                                            map: null,
                                        };
                                    }
                                },
                                generateBundle(_options, bundle) {
                                    for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
                                        if (fileName === "mcp-server.cjs" && chunkOrAsset.type === "chunk") {
                                            const livereloadPattern = /\(function\([^)]*\)\{[^}]*livereload[^}]*\}\)\(self\.document\);/g;
                                            const originalCode = chunkOrAsset.code;
                                            chunkOrAsset.code = originalCode.replace(livereloadPattern, "");
                                            if (chunkOrAsset.code !== originalCode) {
                                                console.log("[remove-livereload] Removed livereload code from mcp-server.cjs in generateBundle");
                                            }
                                        }
                                    }
                                },
                            },
                        ]
                        : [
                            cleanupDistFiles({
                                patterns: ["i18n/*.yaml", "i18n/*.md", "mcp-server.js"],
                                distDir: outputDir,
                            }),
                            zipPack({
                                inDir: `./${outputDir}`,
                                outDir: "./",
                                outFileName: "package.zip",
                            }),
                        ]),
                    assertNoLocalRequire("mcp-server.cjs"),
                ],
                output: {
                    inlineDynamicImports: true,
                    entryFileNames: "mcp-server.cjs",
                },
            },
        },
    };
}

function assertNoLocalRequire(entryFileName: string) {
    const localRequirePattern = /require\((['"])\.\/[^'"]+\1\)/;

    return {
        name: `assert-no-local-require-${entryFileName}`,
        generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
            const entry = bundle[entryFileName];
            if (!entry || entry.type !== "chunk" || typeof entry.code !== "string") {
                return;
            }

            const match = entry.code.match(localRequirePattern);
            if (match) {
                throw new Error(`${entryFileName} emitted unexpected local require: ${match[0]}`);
            }
        },
    };
}

function cleanupDistFiles(options: { patterns: string[]; distDir: string }) {
    const { patterns, distDir } = options;

    return {
        name: "rollup-plugin-cleanup",
        enforce: "post" as const,
        writeBundle: {
            sequential: true,
            order: "post" as const,
            async handler() {
                const fastGlob = await import("fast-glob");
                const fs = await import("fs");

                const distPatterns = patterns.map((pat) => `${distDir}/${pat}`);
                console.debug("Cleanup searching patterns:", distPatterns);

                const files = await fastGlob.default(distPatterns, {
                    dot: true,
                    absolute: true,
                    onlyFiles: false,
                });

                for (const file of files) {
                    try {
                        if (fs.default.existsSync(file)) {
                            const stat = fs.default.statSync(file);
                            if (stat.isDirectory()) {
                                fs.default.rmSync(file, { recursive: true });
                            } else {
                                fs.default.unlinkSync(file);
                            }
                            console.log(`Cleaned up: ${file}`);
                        }
                    } catch (error) {
                        console.error(`Failed to clean up ${file}:`, error);
                    }
                }
            },
        },
    };
}
