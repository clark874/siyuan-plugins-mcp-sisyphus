# SiYuan MCP Sisyphus 项目编码记忆

## 项目配置（2026-04-01）

### 环境初始化已完成
按照 `plugin-sample-vite-svelte` 的配置标准，对本项目进行了配置。

#### 修复的问题
`package.json` 从模板复制过来时，包含了错误的项目信息：
- ✓ 项目名称改为：`siyuan-plugins-mcp-sisyphus`
- ✓ 版本改为：`0.1.4`
- ✓ 作者改为：`Taihong Yang`
- ✓ 仓库链接已更新：`https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus`

#### 依赖安装
```bash
pnpm install
# 所有依赖已安装，包括：
# - @modelcontextprotocol/sdk ^1.26.0
# - zod ^4.3.6
# - 及所有 devDependencies
```

#### 构建验证
```bash
pnpm build  # 生产构建成功
# 生成文件：
# - dist/index.js (30.56 kB) - 插件UI
# - dist/mcp-server.cjs (283.98 kB) - MCP服务器
# - dist/index.css (0.57 kB)
# - package.zip (302 kB) - 完整包
```

###¥ 实测验证
```bash
/Applications/SiYuan.app/Contents/MacOS/SiYuan --remote-debugging-port=9222 # 启动思源

```
### 项目结构（基于 Vite + Svelte）
```
src/
├── index.ts          # 插件入口
├── mcp/
│   └── server.ts     # MCP服务器入口
├── components/       # Svelte 组件
├── libs/            # 工具库
└── ...

dist/               # 构建输出（自动生成）
dev/                # 开发模式输出（运行 pnpm dev 时）
```

### 常用开发命令
```bash
pnpm dev        # 开发模式：watch 模式实时编译
pnpm build      # 生产模式：优化打包
pnpm make-link  # 创建开发链接到 SiYuan 插件目录
```

### 构建配置文件
- `vite.config.ts` - Vite 配置（支持多入口）
- `tsconfig.json` - TypeScript 配置（已配置路径别名）
- `svelte.config.js` - Svelte 配置
- `plugin.json` - SiYuan 插件元数据

### 重要配置项
- **输出格式**：CommonJS (CJS)
- **多入口编译**：
  - `src/index.ts` → `dist/index.js`
  - `src/mcp/server.ts` → `dist/mcp-server.cjs`
- **路径别名**：`@/*` 映射到 `src/*`
- **自动打包**：每次生产构建自动生成 `package.zip`

### 提醒
1. 开发时使用 `pnpm dev` 而不是 `pnpm build`
2. 关联到 SiYuan 时使用 `pnpm make-link`
3. MCP 服务器代码在 `src/mcp/` 下，编译产物为 `dist/mcp-server.cjs`
4. 注意需要兼容远程场景，任何读写操作都必须经过 SiYuan API，不能直接访问本地文件系统
