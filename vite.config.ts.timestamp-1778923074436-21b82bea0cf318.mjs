// vite.config.ts
import { readFileSync } from "fs";
import { resolve as resolve2 } from "path";
import { defineConfig } from "file:///Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39_sass@1.99.0/node_modules/vite/dist/node/index.js";
import { viteStaticCopy } from "file:///Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus/node_modules/.pnpm/vite-plugin-static-copy@1.0.6_vite@5.4.21_@types+node@20.19.39_sass@1.99.0_/node_modules/vite-plugin-static-copy/dist/index.js";
import { svelte } from "file:///Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus/node_modules/.pnpm/@sveltejs+vite-plugin-svelte@3.1.2_svelte@4.2.20_vite@5.4.21_@types+node@20.19.39_sass@1.99.0_/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import zipPack from "file:///Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus/node_modules/.pnpm/vite-plugin-zip-pack@1.2.4_vite@5.4.21_@types+node@20.19.39_sass@1.99.0_/node_modules/vite-plugin-zip-pack/dist/esm/index.mjs";
import fg from "file:///Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus/node_modules/.pnpm/fast-glob@3.3.3/node_modules/fast-glob/out/index.js";

// yaml-plugin.js
import fs from "fs";
import yaml from "file:///Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus/node_modules/.pnpm/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs";
import { resolve } from "path";
function vitePluginYamlI18n(options = {}) {
  const DefaultOptions = {
    inDir: "src/i18n",
    outDir: "dist/i18n"
  };
  const finalOptions = { ...DefaultOptions, ...options };
  return {
    name: "vite-plugin-yaml-i18n",
    buildStart() {
      console.log("\u{1F308} Parse I18n: YAML to JSON..");
      const inDir = finalOptions.inDir;
      const outDir = finalOptions.outDir;
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      const files = fs.readdirSync(inDir);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          console.log(`-- Parsing ${file}`);
          const jsonFile = file.replace(/\.(yaml|yml)$/, ".json");
          if (files.includes(jsonFile)) {
            console.log(`---- File ${jsonFile} already exists, skipping...`);
            continue;
          }
          try {
            const filePath = resolve(inDir, file);
            const fileContents = fs.readFileSync(filePath, "utf8");
            const parsed = yaml.load(fileContents);
            const jsonContent = JSON.stringify(parsed, null, 2);
            const outputFilePath = resolve(outDir, file.replace(/\.(yaml|yml)$/, ".json"));
            console.log(`---- Writing to ${outputFilePath}`);
            fs.writeFileSync(outputFilePath, jsonContent);
          } catch (error) {
            this.error(`---- Error parsing YAML file ${file}: ${error.message}`);
          }
        }
      }
    }
  };
}

// vite.config.ts
var __vite_injected_original_dirname = "/Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus";
var env = process.env;
var isSrcmap = env.VITE_SOURCEMAP === "inline";
var isDev = env.NODE_ENV === "development";
var outputDir = isDev ? "dev" : "dist";
var cliOutputDir = "cli/dist";
var serverExternals = [
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
  "node:querystring"
];
var cliExtraExternals = [
  "os",
  "node:os",
  "readline",
  "node:readline"
];
var validTargets = ["renderer", "server", "cli"];
var buildTarget = validTargets.includes(env.BUILD_TARGET ?? "") ? env.BUILD_TARGET : "renderer";
console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);
console.log("buildTarget=>", buildTarget);
var vite_config_default = defineConfig(() => {
  switch (buildTarget) {
    case "server":
      return createServerConfig();
    case "cli":
      return createCliConfig();
    default:
      return createRendererConfig();
  }
});
function createRendererConfig() {
  return {
    resolve: {
      alias: {
        "@": resolve2(__vite_injected_original_dirname, "src")
      }
    },
    plugins: [
      svelte(),
      vitePluginYamlI18n({
        inDir: "public/i18n",
        outDir: `${outputDir}/i18n`
      }),
      viteStaticCopy({
        targets: [
          { src: "./README*.md", dest: "./" },
          { src: "./plugin.json", dest: "./" },
          { src: "./preview.png", dest: "./" },
          { src: "./icon.png", dest: "./" }
        ]
      })
    ],
    define: {
      "process.env.DEV_MODE": JSON.stringify(isDev),
      "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
    },
    build: {
      outDir: outputDir,
      emptyOutDir: !isDev,
      minify: true,
      sourcemap: isSrcmap ? "inline" : false,
      lib: {
        entry: resolve2(__vite_injected_original_dirname, "src/index.ts"),
        fileName: () => "index",
        formats: ["cjs"]
      },
      rollupOptions: {
        external: ["siyuan"],
        plugins: [
          ...isDev ? [
            {
              name: "watch-external",
              async buildStart() {
                const files = await fg([
                  "public/i18n/**",
                  "./README*.md",
                  "./plugin.json"
                ]);
                for (const file of files) {
                  this.addWatchFile(file);
                }
              }
            }
          ] : [],
          assertNoLocalRequire("index.js")
        ],
        output: {
          inlineDynamicImports: true,
          entryFileNames: "index.js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === "style.css") {
              return "index.css";
            }
            return assetInfo.name ?? "[name][extname]";
          }
        }
      }
    }
  };
}
function createServerConfig() {
  return {
    plugins: [
      {
        name: "sdk-lightweight-resolver",
        enforce: "pre",
        resolveId(id) {
          if (id.endsWith("validation/ajv-provider.js") || id.endsWith("validation/ajv-provider")) {
            return resolve2(__vite_injected_original_dirname, "src/core/noops/noop-schema-validator.ts");
          }
          if (id.endsWith("experimental/tasks/server.js") || id.endsWith("experimental/tasks/server")) {
            return resolve2(__vite_injected_original_dirname, "src/core/noops/noop-experimental-tasks.ts");
          }
          if (id.endsWith("experimental/tasks/helpers.js") || id.endsWith("experimental/tasks/helpers")) {
            return resolve2(__vite_injected_original_dirname, "src/core/noops/noop-experimental-tasks.ts");
          }
          return null;
        }
      }
    ],
    resolve: {
      alias: {
        "@": resolve2(__vite_injected_original_dirname, "src")
      }
    },
    define: {
      "process.env.DEV_MODE": JSON.stringify(isDev),
      "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
    },
    build: {
      outDir: outputDir,
      emptyOutDir: false,
      minify: true,
      sourcemap: isSrcmap ? "inline" : false,
      lib: {
        entry: resolve2(__vite_injected_original_dirname, "src/core/server.ts"),
        fileName: () => "mcp-server",
        formats: ["cjs"]
      },
      rollupOptions: {
        external: serverExternals,
        plugins: [
          ...isDev ? [
            {
              name: "remove-livereload-from-node",
              enforce: "post",
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
                    map: null
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
              }
            }
          ] : [
            cleanupDistFiles({
              patterns: ["i18n/*.yaml", "i18n/*.md", "mcp-server.js"],
              distDir: outputDir
            }),
            zipPack({
              inDir: `./${outputDir}`,
              outDir: "./",
              outFileName: "package.zip"
            })
          ],
          assertNoLocalRequire("mcp-server.cjs")
        ],
        output: {
          inlineDynamicImports: true,
          entryFileNames: "mcp-server.cjs"
        }
      }
    }
  };
}
function readCliVersion() {
  try {
    const raw = readFileSync(resolve2(__vite_injected_original_dirname, "cli/package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function createCliConfig() {
  const version = readCliVersion();
  return {
    plugins: [
      {
        name: "sdk-lightweight-resolver",
        enforce: "pre",
        resolveId(id) {
          if (id.endsWith("validation/ajv-provider.js") || id.endsWith("validation/ajv-provider")) {
            return resolve2(__vite_injected_original_dirname, "src/core/noops/noop-schema-validator.ts");
          }
          if (id.endsWith("experimental/tasks/server.js") || id.endsWith("experimental/tasks/server")) {
            return resolve2(__vite_injected_original_dirname, "src/core/noops/noop-experimental-tasks.ts");
          }
          if (id.endsWith("experimental/tasks/helpers.js") || id.endsWith("experimental/tasks/helpers")) {
            return resolve2(__vite_injected_original_dirname, "src/core/noops/noop-experimental-tasks.ts");
          }
          return null;
        }
      }
    ],
    publicDir: false,
    resolve: {
      alias: {
        "@": resolve2(__vite_injected_original_dirname, "src")
      }
    },
    define: {
      "process.env.DEV_MODE": JSON.stringify(isDev),
      "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
      __CLI_VERSION__: JSON.stringify(version)
    },
    build: {
      outDir: cliOutputDir,
      emptyOutDir: false,
      minify: true,
      sourcemap: isSrcmap ? "inline" : false,
      lib: {
        entry: resolve2(__vite_injected_original_dirname, "src/cli/index.ts"),
        fileName: () => "cli",
        formats: ["cjs"]
      },
      rollupOptions: {
        external: (id) => {
          if (serverExternals.includes(id)) return true;
          if (cliExtraExternals.includes(id)) return true;
          return false;
        },
        plugins: [
          copyCliSkills(),
          shebangAndChmod(`${cliOutputDir}/cli.cjs`)
        ],
        output: {
          inlineDynamicImports: true,
          entryFileNames: "cli.cjs",
          banner: "#!/usr/bin/env node"
        }
      }
    }
  };
}
function copyCliSkills() {
  return {
    name: "cli-copy-skills",
    writeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const fs2 = await import("fs");
        const path = await import("path");
        const source = resolve2(__vite_injected_original_dirname, "skills/siyuan-sisyphus");
        const target = resolve2(__vite_injected_original_dirname, cliOutputDir, "skills/siyuan-sisyphus");
        if (!fs2.default.existsSync(source)) {
          console.warn(`[cli-copy-skills] source not found: ${source}`);
          return;
        }
        fs2.default.rmSync(target, { recursive: true, force: true });
        fs2.default.mkdirSync(path.default.dirname(target), { recursive: true });
        fs2.default.cpSync(source, target, { recursive: true, force: true });
        console.log(`[cli-copy-skills] copied ${source} -> ${target}`);
      }
    }
  };
}
function shebangAndChmod(relPath) {
  return {
    name: "cli-shebang-chmod",
    writeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const fs2 = await import("fs");
        const target = resolve2(__vite_injected_original_dirname, relPath);
        if (fs2.default.existsSync(target)) {
          try {
            fs2.default.chmodSync(target, 493);
            console.log(`[cli-shebang-chmod] chmod 755 ${target}`);
          } catch (error) {
            console.warn(`[cli-shebang-chmod] chmod failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  };
}
function assertNoLocalRequire(entryFileName) {
  const localRequirePattern = /require\((['"])\.\/[^'"]+\1\)/;
  return {
    name: `assert-no-local-require-${entryFileName}`,
    generateBundle(_options, bundle) {
      const entry = bundle[entryFileName];
      if (!entry || entry.type !== "chunk" || typeof entry.code !== "string") {
        return;
      }
      const match = entry.code.match(localRequirePattern);
      if (match) {
        throw new Error(`${entryFileName} emitted unexpected local require: ${match[0]}`);
      }
    }
  };
}
function cleanupDistFiles(options) {
  const { patterns, distDir } = options;
  return {
    name: "rollup-plugin-cleanup",
    enforce: "post",
    writeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const fastGlob = await import("file:///Users/skycat/Documents/GitHub/siyuan-plugin-dev/siyuan-plugins-mcp-sisyphus/node_modules/.pnpm/fast-glob@3.3.3/node_modules/fast-glob/out/index.js");
        const fs2 = await import("fs");
        const distPatterns = patterns.map((pat) => `${distDir}/${pat}`);
        console.debug("Cleanup searching patterns:", distPatterns);
        const files = await fastGlob.default(distPatterns, {
          dot: true,
          absolute: true,
          onlyFiles: false
        });
        for (const file of files) {
          try {
            if (fs2.default.existsSync(file)) {
              const stat = fs2.default.statSync(file);
              if (stat.isDirectory()) {
                fs2.default.rmSync(file, { recursive: true });
              } else {
                fs2.default.unlinkSync(file);
              }
              console.log(`Cleaned up: ${file}`);
            }
          } catch (error) {
            console.error(`Failed to clean up ${file}:`, error);
          }
        }
      }
    }
  };
}
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAieWFtbC1wbHVnaW4uanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvc2t5Y2F0L0RvY3VtZW50cy9HaXRIdWIvc2l5dWFuLXBsdWdpbi1kZXYvc2l5dWFuLXBsdWdpbnMtbWNwLXNpc3lwaHVzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvc2t5Y2F0L0RvY3VtZW50cy9HaXRIdWIvc2l5dWFuLXBsdWdpbi1kZXYvc2l5dWFuLXBsdWdpbnMtbWNwLXNpc3lwaHVzL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9za3ljYXQvRG9jdW1lbnRzL0dpdEh1Yi9zaXl1YW4tcGx1Z2luLWRldi9zaXl1YW4tcGx1Z2lucy1tY3Atc2lzeXBodXMvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tIFwiZnNcIjtcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCB7IHZpdGVTdGF0aWNDb3B5IH0gZnJvbSBcInZpdGUtcGx1Z2luLXN0YXRpYy1jb3B5XCI7XG5pbXBvcnQgeyBzdmVsdGUgfSBmcm9tIFwiQHN2ZWx0ZWpzL3ZpdGUtcGx1Z2luLXN2ZWx0ZVwiO1xuaW1wb3J0IHppcFBhY2sgZnJvbSBcInZpdGUtcGx1Z2luLXppcC1wYWNrXCI7XG5pbXBvcnQgZmcgZnJvbSBcImZhc3QtZ2xvYlwiO1xuXG5pbXBvcnQgdml0ZVBsdWdpbllhbWxJMThuIGZyb20gXCIuL3lhbWwtcGx1Z2luXCI7XG5cbmNvbnN0IGVudiA9IHByb2Nlc3MuZW52O1xuY29uc3QgaXNTcmNtYXAgPSBlbnYuVklURV9TT1VSQ0VNQVAgPT09IFwiaW5saW5lXCI7XG5jb25zdCBpc0RldiA9IGVudi5OT0RFX0VOViA9PT0gXCJkZXZlbG9wbWVudFwiO1xuXG5jb25zdCBvdXRwdXREaXIgPSBpc0RldiA/IFwiZGV2XCIgOiBcImRpc3RcIjtcbmNvbnN0IGNsaU91dHB1dERpciA9IFwiY2xpL2Rpc3RcIjtcblxuY29uc3Qgc2VydmVyRXh0ZXJuYWxzID0gW1xuICAgIFwic2l5dWFuXCIsXG4gICAgXCJwcm9jZXNzXCIsXG4gICAgXCJwYXRoXCIsXG4gICAgXCJmc1wiLFxuICAgIFwibm9kZTpwYXRoXCIsXG4gICAgXCJub2RlOmZzXCIsXG4gICAgXCJjaGlsZF9wcm9jZXNzXCIsXG4gICAgXCJub2RlOmNoaWxkX3Byb2Nlc3NcIixcbiAgICBcIm5vZGU6aHR0cFwiLFxuICAgIFwibm9kZTpjcnlwdG9cIixcbiAgICBcImh0dHBcIixcbiAgICBcImNyeXB0b1wiLFxuICAgIFwic3RyZWFtXCIsXG4gICAgXCJub2RlOnN0cmVhbVwiLFxuICAgIFwiaHR0cDJcIixcbiAgICBcIm5vZGU6aHR0cDJcIixcbiAgICBcInVybFwiLFxuICAgIFwibm9kZTp1cmxcIixcbiAgICBcImJ1ZmZlclwiLFxuICAgIFwibm9kZTpidWZmZXJcIixcbiAgICBcImV2ZW50c1wiLFxuICAgIFwibm9kZTpldmVudHNcIixcbiAgICBcIm5ldFwiLFxuICAgIFwibm9kZTpuZXRcIixcbiAgICBcInRsc1wiLFxuICAgIFwibm9kZTp0bHNcIixcbiAgICBcInpsaWJcIixcbiAgICBcIm5vZGU6emxpYlwiLFxuICAgIFwicXVlcnlzdHJpbmdcIixcbiAgICBcIm5vZGU6cXVlcnlzdHJpbmdcIixcbl07XG5cbmNvbnN0IGNsaUV4dHJhRXh0ZXJuYWxzID0gW1xuICAgIFwib3NcIixcbiAgICBcIm5vZGU6b3NcIixcbiAgICBcInJlYWRsaW5lXCIsXG4gICAgXCJub2RlOnJlYWRsaW5lXCIsXG5dO1xuXG5jb25zdCB2YWxpZFRhcmdldHMgPSBbXCJyZW5kZXJlclwiLCBcInNlcnZlclwiLCBcImNsaVwiXSBhcyBjb25zdDtcbnR5cGUgQnVpbGRUYXJnZXQgPSB0eXBlb2YgdmFsaWRUYXJnZXRzW251bWJlcl07XG5jb25zdCBidWlsZFRhcmdldDogQnVpbGRUYXJnZXQgPSAodmFsaWRUYXJnZXRzIGFzIHJlYWRvbmx5IHN0cmluZ1tdKS5pbmNsdWRlcyhlbnYuQlVJTERfVEFSR0VUID8/IFwiXCIpXG4gICAgPyAoZW52LkJVSUxEX1RBUkdFVCBhcyBCdWlsZFRhcmdldClcbiAgICA6IFwicmVuZGVyZXJcIjtcblxuY29uc29sZS5sb2coXCJpc0Rldj0+XCIsIGlzRGV2KTtcbmNvbnNvbGUubG9nKFwiaXNTcmNtYXA9PlwiLCBpc1NyY21hcCk7XG5jb25zb2xlLmxvZyhcIm91dHB1dERpcj0+XCIsIG91dHB1dERpcik7XG5jb25zb2xlLmxvZyhcImJ1aWxkVGFyZ2V0PT5cIiwgYnVpbGRUYXJnZXQpO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKCkgPT4ge1xuICAgIHN3aXRjaCAoYnVpbGRUYXJnZXQpIHtcbiAgICAgICAgY2FzZSBcInNlcnZlclwiOiByZXR1cm4gY3JlYXRlU2VydmVyQ29uZmlnKCk7XG4gICAgICAgIGNhc2UgXCJjbGlcIjogcmV0dXJuIGNyZWF0ZUNsaUNvbmZpZygpO1xuICAgICAgICBkZWZhdWx0OiByZXR1cm4gY3JlYXRlUmVuZGVyZXJDb25maWcoKTtcbiAgICB9XG59KTtcblxuZnVuY3Rpb24gY3JlYXRlUmVuZGVyZXJDb25maWcoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICAgICAgYWxpYXM6IHtcbiAgICAgICAgICAgICAgICBcIkBcIjogcmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcGx1Z2luczogW1xuICAgICAgICAgICAgc3ZlbHRlKCksXG4gICAgICAgICAgICB2aXRlUGx1Z2luWWFtbEkxOG4oe1xuICAgICAgICAgICAgICAgIGluRGlyOiBcInB1YmxpYy9pMThuXCIsXG4gICAgICAgICAgICAgICAgb3V0RGlyOiBgJHtvdXRwdXREaXJ9L2kxOG5gLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB2aXRlU3RhdGljQ29weSh7XG4gICAgICAgICAgICAgICAgdGFyZ2V0czogW1xuICAgICAgICAgICAgICAgICAgICB7IHNyYzogXCIuL1JFQURNRSoubWRcIiwgZGVzdDogXCIuL1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgc3JjOiBcIi4vcGx1Z2luLmpzb25cIiwgZGVzdDogXCIuL1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgc3JjOiBcIi4vcHJldmlldy5wbmdcIiwgZGVzdDogXCIuL1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgc3JjOiBcIi4vaWNvbi5wbmdcIiwgZGVzdDogXCIuL1wiIH0sXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICBkZWZpbmU6IHtcbiAgICAgICAgICAgIFwicHJvY2Vzcy5lbnYuREVWX01PREVcIjogSlNPTi5zdHJpbmdpZnkoaXNEZXYpLFxuICAgICAgICAgICAgXCJwcm9jZXNzLmVudi5OT0RFX0VOVlwiOiBKU09OLnN0cmluZ2lmeShlbnYuTk9ERV9FTlYpLFxuICAgICAgICB9LFxuICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgb3V0RGlyOiBvdXRwdXREaXIsXG4gICAgICAgICAgICBlbXB0eU91dERpcjogIWlzRGV2LFxuICAgICAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICAgICAgc291cmNlbWFwOiBpc1NyY21hcCA/IFwiaW5saW5lXCIgOiBmYWxzZSxcbiAgICAgICAgICAgIGxpYjoge1xuICAgICAgICAgICAgICAgIGVudHJ5OiByZXNvbHZlKF9fZGlybmFtZSwgXCJzcmMvaW5kZXgudHNcIiksXG4gICAgICAgICAgICAgICAgZmlsZU5hbWU6ICgpID0+IFwiaW5kZXhcIixcbiAgICAgICAgICAgICAgICBmb3JtYXRzOiBbXCJjanNcIl0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgICAgICAgICAgIGV4dGVybmFsOiBbXCJzaXl1YW5cIl0sXG4gICAgICAgICAgICAgICAgcGx1Z2luczogW1xuICAgICAgICAgICAgICAgICAgICAuLi4oaXNEZXZcbiAgICAgICAgICAgICAgICAgICAgICAgID8gW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJ3YXRjaC1leHRlcm5hbFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc3luYyBidWlsZFN0YXJ0KCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmZyhbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwdWJsaWMvaTE4bi8qKlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiLi9SRUFETUUqLm1kXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIuL3BsdWdpbi5qc29uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkV2F0Y2hGaWxlKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFtdKSxcbiAgICAgICAgICAgICAgICAgICAgYXNzZXJ0Tm9Mb2NhbFJlcXVpcmUoXCJpbmRleC5qc1wiKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIG91dHB1dDoge1xuICAgICAgICAgICAgICAgICAgICBpbmxpbmVEeW5hbWljSW1wb3J0czogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZW50cnlGaWxlTmFtZXM6IFwiaW5kZXguanNcIixcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRGaWxlTmFtZXM6IChhc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8ubmFtZSA9PT0gXCJzdHlsZS5jc3NcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcImluZGV4LmNzc1wiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFzc2V0SW5mby5uYW1lID8/IFwiW25hbWVdW2V4dG5hbWVdXCI7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2VydmVyQ29uZmlnKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHBsdWdpbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiBcInNkay1saWdodHdlaWdodC1yZXNvbHZlclwiLFxuICAgICAgICAgICAgICAgIGVuZm9yY2U6IFwicHJlXCIgYXMgY29uc3QsXG4gICAgICAgICAgICAgICAgcmVzb2x2ZUlkKGlkOiBzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlkLmVuZHNXaXRoKFwidmFsaWRhdGlvbi9hanYtcHJvdmlkZXIuanNcIikgfHwgaWQuZW5kc1dpdGgoXCJ2YWxpZGF0aW9uL2Fqdi1wcm92aWRlclwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9jb3JlL25vb3BzL25vb3Atc2NoZW1hLXZhbGlkYXRvci50c1wiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoaWQuZW5kc1dpdGgoXCJleHBlcmltZW50YWwvdGFza3Mvc2VydmVyLmpzXCIpIHx8IGlkLmVuZHNXaXRoKFwiZXhwZXJpbWVudGFsL3Rhc2tzL3NlcnZlclwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9jb3JlL25vb3BzL25vb3AtZXhwZXJpbWVudGFsLXRhc2tzLnRzXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChpZC5lbmRzV2l0aChcImV4cGVyaW1lbnRhbC90YXNrcy9oZWxwZXJzLmpzXCIpIHx8IGlkLmVuZHNXaXRoKFwiZXhwZXJpbWVudGFsL3Rhc2tzL2hlbHBlcnNcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKF9fZGlybmFtZSwgXCJzcmMvY29yZS9ub29wcy9ub29wLWV4cGVyaW1lbnRhbC10YXNrcy50c1wiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICAgICAgYWxpYXM6IHtcbiAgICAgICAgICAgICAgICBcIkBcIjogcmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgZGVmaW5lOiB7XG4gICAgICAgICAgICBcInByb2Nlc3MuZW52LkRFVl9NT0RFXCI6IEpTT04uc3RyaW5naWZ5KGlzRGV2KSxcbiAgICAgICAgICAgIFwicHJvY2Vzcy5lbnYuTk9ERV9FTlZcIjogSlNPTi5zdHJpbmdpZnkoZW52Lk5PREVfRU5WKSxcbiAgICAgICAgfSxcbiAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgIG91dERpcjogb3V0cHV0RGlyLFxuICAgICAgICAgICAgZW1wdHlPdXREaXI6IGZhbHNlLFxuICAgICAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICAgICAgc291cmNlbWFwOiBpc1NyY21hcCA/IFwiaW5saW5lXCIgOiBmYWxzZSxcbiAgICAgICAgICAgIGxpYjoge1xuICAgICAgICAgICAgICAgIGVudHJ5OiByZXNvbHZlKF9fZGlybmFtZSwgXCJzcmMvY29yZS9zZXJ2ZXIudHNcIiksXG4gICAgICAgICAgICAgICAgZmlsZU5hbWU6ICgpID0+IFwibWNwLXNlcnZlclwiLFxuICAgICAgICAgICAgICAgIGZvcm1hdHM6IFtcImNqc1wiXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgZXh0ZXJuYWw6IHNlcnZlckV4dGVybmFscyxcbiAgICAgICAgICAgICAgICBwbHVnaW5zOiBbXG4gICAgICAgICAgICAgICAgICAgIC4uLihpc0RldlxuICAgICAgICAgICAgICAgICAgICAgICAgPyBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInJlbW92ZS1saXZlcmVsb2FkLWZyb20tbm9kZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmZvcmNlOiBcInBvc3RcIiBhcyBjb25zdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyQ2h1bmsoY29kZSwgY2h1bmspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzTWNwU2VydmVyID0gY2h1bmsubmFtZSA9PT0gXCJtY3Atc2VydmVyXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNMaXZlcmVsb2FkID0gY29kZS5pbmNsdWRlcyhcImxpdmVyZWxvYWRcIikgJiYgY29kZS5pbmNsdWRlcyhcInNlbGYuZG9jdW1lbnRcIik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc01jcFNlcnZlciB8fCBoYXNMaXZlcmVsb2FkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGl2ZXJlbG9hZFBhdHRlcm4gPSAvXFwoZnVuY3Rpb25cXChbXildKlxcKVxce1tefV0qbGl2ZXJlbG9hZFtefV0qXFx9XFwpXFwoc2VsZlxcLmRvY3VtZW50XFwpOy9nO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFuZWRDb2RlID0gY29kZS5yZXBsYWNlKGxpdmVyZWxvYWRQYXR0ZXJuLCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xlYW5lZENvZGUgIT09IGNvZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFtyZW1vdmUtbGl2ZXJlbG9hZF0gUmVtb3ZlZCBsaXZlcmVsb2FkIGNvZGUgZnJvbSBjaHVuazogJHtjaHVuay5uYW1lIHx8IFwidW5rbm93blwifWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBjbGVhbmVkQ29kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdlbmVyYXRlQnVuZGxlKF9vcHRpb25zLCBidW5kbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgW2ZpbGVOYW1lLCBjaHVua09yQXNzZXRdIG9mIE9iamVjdC5lbnRyaWVzKGJ1bmRsZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZmlsZU5hbWUgPT09IFwibWNwLXNlcnZlci5janNcIiAmJiBjaHVua09yQXNzZXQudHlwZSA9PT0gXCJjaHVua1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpdmVyZWxvYWRQYXR0ZXJuID0gL1xcKGZ1bmN0aW9uXFwoW14pXSpcXClcXHtbXn1dKmxpdmVyZWxvYWRbXn1dKlxcfVxcKVxcKHNlbGZcXC5kb2N1bWVudFxcKTsvZztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxDb2RlID0gY2h1bmtPckFzc2V0LmNvZGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNodW5rT3JBc3NldC5jb2RlID0gb3JpZ2luYWxDb2RlLnJlcGxhY2UobGl2ZXJlbG9hZFBhdHRlcm4sIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2h1bmtPckFzc2V0LmNvZGUgIT09IG9yaWdpbmFsQ29kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJbcmVtb3ZlLWxpdmVyZWxvYWRdIFJlbW92ZWQgbGl2ZXJlbG9hZCBjb2RlIGZyb20gbWNwLXNlcnZlci5janMgaW4gZ2VuZXJhdGVCdW5kbGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICAgICAgICAgIDogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFudXBEaXN0RmlsZXMoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuczogW1wiaTE4bi8qLnlhbWxcIiwgXCJpMThuLyoubWRcIiwgXCJtY3Atc2VydmVyLmpzXCJdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaXN0RGlyOiBvdXRwdXREaXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgemlwUGFjayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluRGlyOiBgLi8ke291dHB1dERpcn1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvdXREaXI6IFwiLi9cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0RmlsZU5hbWU6IFwicGFja2FnZS56aXBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgICAgICAgICBhc3NlcnROb0xvY2FsUmVxdWlyZShcIm1jcC1zZXJ2ZXIuY2pzXCIpLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgb3V0cHV0OiB7XG4gICAgICAgICAgICAgICAgICAgIGlubGluZUR5bmFtaWNJbXBvcnRzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBlbnRyeUZpbGVOYW1lczogXCJtY3Atc2VydmVyLmNqc1wiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlYWRDbGlWZXJzaW9uKCk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmF3ID0gcmVhZEZpbGVTeW5jKHJlc29sdmUoX19kaXJuYW1lLCBcImNsaS9wYWNrYWdlLmpzb25cIiksIFwidXRmOFwiKTtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuICAgICAgICByZXR1cm4gdHlwZW9mIHBhcnNlZC52ZXJzaW9uID09PSBcInN0cmluZ1wiID8gcGFyc2VkLnZlcnNpb24gOiBcIjAuMC4wXCI7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIjAuMC4wXCI7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVDbGlDb25maWcoKSB7XG4gICAgY29uc3QgdmVyc2lvbiA9IHJlYWRDbGlWZXJzaW9uKCk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcGx1Z2luczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6IFwic2RrLWxpZ2h0d2VpZ2h0LXJlc29sdmVyXCIsXG4gICAgICAgICAgICAgICAgZW5mb3JjZTogXCJwcmVcIiBhcyBjb25zdCxcbiAgICAgICAgICAgICAgICByZXNvbHZlSWQoaWQ6IHN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaWQuZW5kc1dpdGgoXCJ2YWxpZGF0aW9uL2Fqdi1wcm92aWRlci5qc1wiKSB8fCBpZC5lbmRzV2l0aChcInZhbGlkYXRpb24vYWp2LXByb3ZpZGVyXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjL2NvcmUvbm9vcHMvbm9vcC1zY2hlbWEtdmFsaWRhdG9yLnRzXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChpZC5lbmRzV2l0aChcImV4cGVyaW1lbnRhbC90YXNrcy9zZXJ2ZXIuanNcIikgfHwgaWQuZW5kc1dpdGgoXCJleHBlcmltZW50YWwvdGFza3Mvc2VydmVyXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjL2NvcmUvbm9vcHMvbm9vcC1leHBlcmltZW50YWwtdGFza3MudHNcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlkLmVuZHNXaXRoKFwiZXhwZXJpbWVudGFsL3Rhc2tzL2hlbHBlcnMuanNcIikgfHwgaWQuZW5kc1dpdGgoXCJleHBlcmltZW50YWwvdGFza3MvaGVscGVyc1wiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9jb3JlL25vb3BzL25vb3AtZXhwZXJpbWVudGFsLXRhc2tzLnRzXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBwdWJsaWNEaXI6IGZhbHNlIGFzIGNvbnN0LFxuICAgICAgICByZXNvbHZlOiB7XG4gICAgICAgICAgICBhbGlhczoge1xuICAgICAgICAgICAgICAgIFwiQFwiOiByZXNvbHZlKF9fZGlybmFtZSwgXCJzcmNcIiksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBkZWZpbmU6IHtcbiAgICAgICAgICAgIFwicHJvY2Vzcy5lbnYuREVWX01PREVcIjogSlNPTi5zdHJpbmdpZnkoaXNEZXYpLFxuICAgICAgICAgICAgXCJwcm9jZXNzLmVudi5OT0RFX0VOVlwiOiBKU09OLnN0cmluZ2lmeShlbnYuTk9ERV9FTlYpLFxuICAgICAgICAgICAgX19DTElfVkVSU0lPTl9fOiBKU09OLnN0cmluZ2lmeSh2ZXJzaW9uKSxcbiAgICAgICAgfSxcbiAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgIG91dERpcjogY2xpT3V0cHV0RGlyLFxuICAgICAgICAgICAgZW1wdHlPdXREaXI6IGZhbHNlLFxuICAgICAgICAgICAgbWluaWZ5OiB0cnVlLFxuICAgICAgICAgICAgc291cmNlbWFwOiBpc1NyY21hcCA/IFwiaW5saW5lXCIgOiBmYWxzZSxcbiAgICAgICAgICAgIGxpYjoge1xuICAgICAgICAgICAgICAgIGVudHJ5OiByZXNvbHZlKF9fZGlybmFtZSwgXCJzcmMvY2xpL2luZGV4LnRzXCIpLFxuICAgICAgICAgICAgICAgIGZpbGVOYW1lOiAoKSA9PiBcImNsaVwiLFxuICAgICAgICAgICAgICAgIGZvcm1hdHM6IFtcImNqc1wiXSBhcyBjb25zdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgZXh0ZXJuYWw6IChpZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzZXJ2ZXJFeHRlcm5hbHMuaW5jbHVkZXMoaWQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsaUV4dHJhRXh0ZXJuYWxzLmluY2x1ZGVzKGlkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHBsdWdpbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgY29weUNsaVNraWxscygpLFxuICAgICAgICAgICAgICAgICAgICBzaGViYW5nQW5kQ2htb2QoYCR7Y2xpT3V0cHV0RGlyfS9jbGkuY2pzYCksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBvdXRwdXQ6IHtcbiAgICAgICAgICAgICAgICAgICAgaW5saW5lRHluYW1pY0ltcG9ydHM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGVudHJ5RmlsZU5hbWVzOiBcImNsaS5janNcIixcbiAgICAgICAgICAgICAgICAgICAgYmFubmVyOiBcIiMhL3Vzci9iaW4vZW52IG5vZGVcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBjb3B5Q2xpU2tpbGxzKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IFwiY2xpLWNvcHktc2tpbGxzXCIsXG4gICAgICAgIHdyaXRlQnVuZGxlOiB7XG4gICAgICAgICAgICBzZXF1ZW50aWFsOiB0cnVlLFxuICAgICAgICAgICAgb3JkZXI6IFwicG9zdFwiIGFzIGNvbnN0LFxuICAgICAgICAgICAgYXN5bmMgaGFuZGxlcigpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmcyA9IGF3YWl0IGltcG9ydChcImZzXCIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCBpbXBvcnQoXCJwYXRoXCIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHJlc29sdmUoX19kaXJuYW1lLCBcInNraWxscy9zaXl1YW4tc2lzeXBodXNcIik7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gcmVzb2x2ZShfX2Rpcm5hbWUsIGNsaU91dHB1dERpciwgXCJza2lsbHMvc2l5dWFuLXNpc3lwaHVzXCIpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFmcy5kZWZhdWx0LmV4aXN0c1N5bmMoc291cmNlKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtjbGktY29weS1za2lsbHNdIHNvdXJjZSBub3QgZm91bmQ6ICR7c291cmNlfWApO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZnMuZGVmYXVsdC5ybVN5bmModGFyZ2V0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgZnMuZGVmYXVsdC5ta2RpclN5bmMocGF0aC5kZWZhdWx0LmRpcm5hbWUodGFyZ2V0KSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgZnMuZGVmYXVsdC5jcFN5bmMoc291cmNlLCB0YXJnZXQsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW2NsaS1jb3B5LXNraWxsc10gY29waWVkICR7c291cmNlfSAtPiAke3RhcmdldH1gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gc2hlYmFuZ0FuZENobW9kKHJlbFBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IFwiY2xpLXNoZWJhbmctY2htb2RcIixcbiAgICAgICAgd3JpdGVCdW5kbGU6IHtcbiAgICAgICAgICAgIHNlcXVlbnRpYWw6IHRydWUsXG4gICAgICAgICAgICBvcmRlcjogXCJwb3N0XCIgYXMgY29uc3QsXG4gICAgICAgICAgICBhc3luYyBoYW5kbGVyKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KFwiZnNcIik7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gcmVzb2x2ZShfX2Rpcm5hbWUsIHJlbFBhdGgpO1xuICAgICAgICAgICAgICAgIGlmIChmcy5kZWZhdWx0LmV4aXN0c1N5bmModGFyZ2V0KSkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZnMuZGVmYXVsdC5jaG1vZFN5bmModGFyZ2V0LCAwbzc1NSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW2NsaS1zaGViYW5nLWNobW9kXSBjaG1vZCA3NTUgJHt0YXJnZXR9YCk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtjbGktc2hlYmFuZy1jaG1vZF0gY2htb2QgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0Tm9Mb2NhbFJlcXVpcmUoZW50cnlGaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbG9jYWxSZXF1aXJlUGF0dGVybiA9IC9yZXF1aXJlXFwoKFsnXCJdKVxcLlxcL1teJ1wiXStcXDFcXCkvO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbmFtZTogYGFzc2VydC1uby1sb2NhbC1yZXF1aXJlLSR7ZW50cnlGaWxlTmFtZX1gLFxuICAgICAgICBnZW5lcmF0ZUJ1bmRsZShfb3B0aW9uczogdW5rbm93biwgYnVuZGxlOiBSZWNvcmQ8c3RyaW5nLCB7IHR5cGU6IHN0cmluZzsgY29kZT86IHN0cmluZyB9Pikge1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBidW5kbGVbZW50cnlGaWxlTmFtZV07XG4gICAgICAgICAgICBpZiAoIWVudHJ5IHx8IGVudHJ5LnR5cGUgIT09IFwiY2h1bmtcIiB8fCB0eXBlb2YgZW50cnkuY29kZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBlbnRyeS5jb2RlLm1hdGNoKGxvY2FsUmVxdWlyZVBhdHRlcm4pO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VudHJ5RmlsZU5hbWV9IGVtaXR0ZWQgdW5leHBlY3RlZCBsb2NhbCByZXF1aXJlOiAke21hdGNoWzBdfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGNsZWFudXBEaXN0RmlsZXMob3B0aW9uczogeyBwYXR0ZXJuczogc3RyaW5nW107IGRpc3REaXI6IHN0cmluZyB9KSB7XG4gICAgY29uc3QgeyBwYXR0ZXJucywgZGlzdERpciB9ID0gb3B0aW9ucztcblxuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IFwicm9sbHVwLXBsdWdpbi1jbGVhbnVwXCIsXG4gICAgICAgIGVuZm9yY2U6IFwicG9zdFwiIGFzIGNvbnN0LFxuICAgICAgICB3cml0ZUJ1bmRsZToge1xuICAgICAgICAgICAgc2VxdWVudGlhbDogdHJ1ZSxcbiAgICAgICAgICAgIG9yZGVyOiBcInBvc3RcIiBhcyBjb25zdCxcbiAgICAgICAgICAgIGFzeW5jIGhhbmRsZXIoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmFzdEdsb2IgPSBhd2FpdCBpbXBvcnQoXCJmYXN0LWdsb2JcIik7XG4gICAgICAgICAgICAgICAgY29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoXCJmc1wiKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGRpc3RQYXR0ZXJucyA9IHBhdHRlcm5zLm1hcCgocGF0KSA9PiBgJHtkaXN0RGlyfS8ke3BhdH1gKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiQ2xlYW51cCBzZWFyY2hpbmcgcGF0dGVybnM6XCIsIGRpc3RQYXR0ZXJucyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlcyA9IGF3YWl0IGZhc3RHbG9iLmRlZmF1bHQoZGlzdFBhdHRlcm5zLCB7XG4gICAgICAgICAgICAgICAgICAgIGRvdDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgYWJzb2x1dGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG9ubHlGaWxlczogZmFsc2UsXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmcy5kZWZhdWx0LmV4aXN0c1N5bmMoZmlsZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuZGVmYXVsdC5zdGF0U3luYyhmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZzLmRlZmF1bHQucm1TeW5jKGZpbGUsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZzLmRlZmF1bHQudW5saW5rU3luYyhmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYENsZWFuZWQgdXA6ICR7ZmlsZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBjbGVhbiB1cCAke2ZpbGV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfTtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL3NreWNhdC9Eb2N1bWVudHMvR2l0SHViL3NpeXVhbi1wbHVnaW4tZGV2L3NpeXVhbi1wbHVnaW5zLW1jcC1zaXN5cGh1c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3NreWNhdC9Eb2N1bWVudHMvR2l0SHViL3NpeXVhbi1wbHVnaW4tZGV2L3NpeXVhbi1wbHVnaW5zLW1jcC1zaXN5cGh1cy95YW1sLXBsdWdpbi5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvc2t5Y2F0L0RvY3VtZW50cy9HaXRIdWIvc2l5dWFuLXBsdWdpbi1kZXYvc2l5dWFuLXBsdWdpbnMtbWNwLXNpc3lwaHVzL3lhbWwtcGx1Z2luLmpzXCI7LypcbiAqIENvcHlyaWdodCAoYykgMjAyNCBieSBmcm9zdGltZS4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqIEBBdXRob3IgICAgICAgOiBmcm9zdGltZVxuICogQERhdGUgICAgICAgICA6IDIwMjQtMDQtMDUgMjE6Mjc6NTVcbiAqIEBGaWxlUGF0aCAgICAgOiAveWFtbC1wbHVnaW4uanNcbiAqIEBMYXN0RWRpdFRpbWUgOiAyMDI0LTA0LTA1IDIyOjUzOjM0XG4gKiBARGVzY3JpcHRpb24gIDogXHU1M0JCXHU1OUFFXHU3MzlCXHU3Njg0IGpzb24gXHU2ODNDXHU1RjBGXHVGRjBDXHU2MjExXHU1QzMxXHU2NjJGXHU4OTgxXHU3NTI4IHlhbWwgXHU1MTk5IGkxOG5cbiAqL1xuLy8gcGx1Z2lucy92aXRlLXBsdWdpbi1wYXJzZS15YW1sLmpzXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHlhbWwgZnJvbSAnanMteWFtbCc7XG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHZpdGVQbHVnaW5ZYW1sSTE4bihvcHRpb25zID0ge30pIHtcbiAgICAvLyBEZWZhdWx0IG9wdGlvbnMgd2l0aCBhIGZhbGxiYWNrXG4gICAgY29uc3QgRGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgIGluRGlyOiAnc3JjL2kxOG4nLFxuICAgICAgICBvdXREaXI6ICdkaXN0L2kxOG4nLFxuICAgIH07XG5cbiAgICBjb25zdCBmaW5hbE9wdGlvbnMgPSB7IC4uLkRlZmF1bHRPcHRpb25zLCAuLi5vcHRpb25zIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiAndml0ZS1wbHVnaW4teWFtbC1pMThuJyxcbiAgICAgICAgYnVpbGRTdGFydCgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdcdUQ4M0NcdURGMDggUGFyc2UgSTE4bjogWUFNTCB0byBKU09OLi4nKTtcbiAgICAgICAgICAgIGNvbnN0IGluRGlyID0gZmluYWxPcHRpb25zLmluRGlyO1xuICAgICAgICAgICAgY29uc3Qgb3V0RGlyID0gZmluYWxPcHRpb25zLm91dERpclxuXG4gICAgICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMob3V0RGlyKSkge1xuICAgICAgICAgICAgICAgIGZzLm1rZGlyU3luYyhvdXREaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL1BhcnNlIHlhbWwgZmlsZSwgb3V0cHV0IHRvIGpzb25cbiAgICAgICAgICAgIGNvbnN0IGZpbGVzID0gZnMucmVhZGRpclN5bmMoaW5EaXIpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGUuZW5kc1dpdGgoJy55YW1sJykgfHwgZmlsZS5lbmRzV2l0aCgnLnltbCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAtLSBQYXJzaW5nICR7ZmlsZX1gKVxuICAgICAgICAgICAgICAgICAgICAvL1x1NjhDMFx1NjdFNVx1NjYyRlx1NTQyNlx1NjcwOVx1NTQwQ1x1NTQwRFx1NzY4NGpzb25cdTY1ODdcdTRFRjZcbiAgICAgICAgICAgICAgICAgICAgY29uc3QganNvbkZpbGUgPSBmaWxlLnJlcGxhY2UoL1xcLih5YW1sfHltbCkkLywgJy5qc29uJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaWxlcy5pbmNsdWRlcyhqc29uRmlsZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAtLS0tIEZpbGUgJHtqc29uRmlsZX0gYWxyZWFkeSBleGlzdHMsIHNraXBwaW5nLi4uYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSByZXNvbHZlKGluRGlyLCBmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVDb250ZW50cyA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IHlhbWwubG9hZChmaWxlQ29udGVudHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QganNvbkNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShwYXJzZWQsIG51bGwsIDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3V0cHV0RmlsZVBhdGggPSByZXNvbHZlKG91dERpciwgZmlsZS5yZXBsYWNlKC9cXC4oeWFtbHx5bWwpJC8sICcuanNvbicpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAtLS0tIFdyaXRpbmcgdG8gJHtvdXRwdXRGaWxlUGF0aH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMob3V0cHV0RmlsZVBhdGgsIGpzb25Db250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXJyb3IoYC0tLS0gRXJyb3IgcGFyc2luZyBZQU1MIGZpbGUgJHtmaWxlfTogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNaLFNBQVMsb0JBQW9CO0FBQ25iLFNBQVMsV0FBQUEsZ0JBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjO0FBQ3ZCLE9BQU8sYUFBYTtBQUNwQixPQUFPLFFBQVE7OztBQ0dmLE9BQU8sUUFBUTtBQUNmLE9BQU8sVUFBVTtBQUNqQixTQUFTLGVBQWU7QUFFVCxTQUFSLG1CQUFvQyxVQUFVLENBQUMsR0FBRztBQUVyRCxRQUFNLGlCQUFpQjtBQUFBLElBQ25CLE9BQU87QUFBQSxJQUNQLFFBQVE7QUFBQSxFQUNaO0FBRUEsUUFBTSxlQUFlLEVBQUUsR0FBRyxnQkFBZ0IsR0FBRyxRQUFRO0FBRXJELFNBQU87QUFBQSxJQUNILE1BQU07QUFBQSxJQUNOLGFBQWE7QUFDVCxjQUFRLElBQUksc0NBQStCO0FBQzNDLFlBQU0sUUFBUSxhQUFhO0FBQzNCLFlBQU0sU0FBUyxhQUFhO0FBRTVCLFVBQUksQ0FBQyxHQUFHLFdBQVcsTUFBTSxHQUFHO0FBQ3hCLFdBQUcsVUFBVSxRQUFRLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxNQUM1QztBQUdBLFlBQU0sUUFBUSxHQUFHLFlBQVksS0FBSztBQUNsQyxpQkFBVyxRQUFRLE9BQU87QUFDdEIsWUFBSSxLQUFLLFNBQVMsT0FBTyxLQUFLLEtBQUssU0FBUyxNQUFNLEdBQUc7QUFDakQsa0JBQVEsSUFBSSxjQUFjLElBQUksRUFBRTtBQUVoQyxnQkFBTSxXQUFXLEtBQUssUUFBUSxpQkFBaUIsT0FBTztBQUN0RCxjQUFJLE1BQU0s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
