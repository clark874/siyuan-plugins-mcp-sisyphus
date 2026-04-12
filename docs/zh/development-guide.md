# 开发指南

本指南帮助开发者理解和参与 SiYuan MCP Sisyphus 项目的开发。

## 目录

1. [开发环境搭建](#开发环境搭建)
2. [构建系统说明](#构建系统说明)
3. [开发工作流](#开发工作流)
4. [测试](#测试)
5. [代码规范](#代码规范)
6. [如何添加新工具](#如何添加新工具)
7. [如何添加新action](#如何添加新action)
8. [调试技巧](#调试技巧)

---

## 开发环境搭建

### 前置要求

- **Node.js**: 20.x 或更高版本（参考 package.json 中的 `engines`）
- **pnpm**: 包管理器（通过 `npm install -g pnpm` 安装）
- **思源笔记**: 本地安装用于测试

### 克隆与安装

```bash
# 克隆仓库
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus

# 安装依赖
pnpm install
```

### 项目结构

```
siyuan-plugins-mcp-sisyphus/
├── src/
│   ├── index.ts              # 插件入口（UI）
│   ├── mcp/
│   │   ├── server.ts         # MCP 服务器入口
│   │   ├── config.ts         # 工具配置
│   │   ├── types.ts          # 所有 action 的 Zod 模式
│   │   ├── permissions.ts    # 权限管理
│   │   ├── tools/            # 工具实现
│   │   │   ├── block.ts
│   │   │   ├── document.ts
│   │   │   ├── notebook.ts
│   │   │   ├── av.ts
│   │   │   ├── search.ts
│   │   │   ├── file.ts
│   │   │   ├── tag.ts
│   │   │   ├── system.ts
│   │   │   ├── flashcard.ts
│   │   │   ├── mascot.ts
│   │   │   ├── shared.ts     # 共享工具函数
│   │   │   └── context.ts    # 上下文解析
│   │   └── resources/        # MCP 资源
│   ├── api/                  # 思源 API 封装
│   │   ├── client.ts
│   │   ├── block.ts
│   │   ├── document.ts
│   │   └── ...
│   ├── components/           # Svelte UI 组件
│   └── libs/                 # 工具库
├── tests/                    # 测试套件
├── public/i18n/              # 国际化文件
├── dist/                     # 生产构建输出
└── dev/                      # 开发构建输出
```

---

## 构建系统说明

### Vite 配置

项目使用 Vite 多入口配置（`vite.config.ts`）：

```typescript
// 关键配置点
export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),  // 路径别名
        }
    },
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, "src/index.ts"),
                "mcp-server": resolve(__dirname, "src/mcp/server.ts"),
            },
            formats: ["cjs"],  // CommonJS 输出
        },
        rollupOptions: {
            external: ["siyuan", "process", "path", "fs", /* ... */],
        }
    }
});
```

**主要特性：**
- **多入口**: 同时构建插件 UI (`index.js`) 和 MCP 服务器 (`mcp-server.cjs`)
- **输出格式**: CommonJS (CJS)，兼容 Node.js
- **路径别名**: `@/*` 映射到 `src/*`
- **外部依赖**: Node.js 内置模块和思源 API 被外部化

### TypeScript 配置

`tsconfig.json`:
- 目标: ESNext
- 模块: ESNext
- 模块解析: Node
- 路径别名: `@/*` 和 `@/libs/*`
- 包含: `src/**/*.ts`, `tests/**/*.ts`

### Svelte 配置

`svelte.config.js`:
- 预处理器: `vitePreprocess()`
- 抑制可访问性规则警告 (a11y)

---

## 开发工作流

### 可用脚本

```bash
# 开发模式（监听）
pnpm dev

# 生产构建
pnpm build

# 创建到思源的开发链接
pnpm make-link

# 生成可安装包
pnpm make-install
```

### 开发模式

```bash
pnpm dev
```

- 启用监听模式和内联 source map
- 输出到 `dev/` 目录
- 文件变更时自动重新构建
- 不会自动刷新思源（需要手动刷新）

### 生产构建

```bash
pnpm build
```

- 输出到 `dist/` 目录
- 生成文件：
  - `dist/index.js` - 插件 UI 包
  - `dist/mcp-server.cjs` - MCP 服务器包
  - `dist/index.css` - 样式
  - `package.zip` - 完整安装包

### 链接到思源

```bash
# macOS/Linux
pnpm make-link

# Windows
pnpm make-link-win
```

这会在思源插件目录和开发文件夹之间创建符号链接。

### 创建安装包

```bash
pnpm make-install
```

构建并打包插件用于分发。

---

## 测试

### 测试命令

```bash
# 运行所有测试
pnpm test

# 监听模式运行测试
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage

# 实时冒烟测试（需要运行中的思源）
pnpm test:smoke
```

### 测试结构

```
tests/
├── setup.ts                  # 测试环境设置
├── mocks/
│   └── siyuan.ts            # 思源 API 模拟
├── unit/                    # 单元测试
│   ├── client.test.ts
│   ├── error.test.ts
│   ├── tool-config.test.ts
│   └── ...
└── integration/             # 集成测试
    ├── mcp-e2e.test.ts
    ├── server.test.ts
    └── http-concurrency.test.ts
```

### 编写测试

测试使用 Vitest，遵循以下模式：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from '@/mcp/tools/my-tool';

describe('my-tool', () => {
    it('应该处理有效输入', async () => {
        const result = await myFunction({ action: 'test' });
        expect(result.content[0].text).toContain('success');
    });

    it('应该优雅地处理错误', async () => {
        const result = await myFunction({ action: 'invalid' });
        expect(result.isError).toBe(true);
    });
});
```

### 测试设置

`tests/setup.ts` 文件：
- 保留原始 `fetch` 全局对象
- 每个测试后恢复模拟

---

## 代码规范

### 目录结构约定

1. **API 层** (`src/api/`)
   - 每个思源 API 域一个文件
   - 纯函数封装思源内核 API
   - 返回原始 API 响应

2. **工具层** (`src/mcp/tools/`)
   - 每个工具类别一个文件
   - Action 处理器实现业务逻辑
   - 处理权限和 UI 刷新

3. **类型定义** (`src/mcp/types.ts`)
   - 所有 action 参数的 Zod 模式
   - 每个 action 一个模式
   - 复杂验证使用 `.superRefine()`

4. **配置** (`src/mcp/config.ts`)
   - 工具类别定义
   - Action 列表和层级
   - 默认配置

### 错误处理模式

```typescript
// 使用共享的错误工具函数
import { createErrorResult, createJsonResult } from './shared';

try {
    const result = await apiCall();
    return createJsonResult({ success: true, data: result });
} catch (error) {
    return createErrorResult(error, { tool: 'my-tool', action: 'my-action', rawArgs });
}
```

### TypeScript 类型定义

- 对象形状优先使用 `interface` 而非 `type`
- Action 数组使用 `const` 断言
- 类型从 `types.ts` 导出
- 运行时验证使用 Zod

### 代码注释

- 为复杂业务逻辑添加文档
- 解释非明显的变通方案
- 公共函数使用 JSDoc
- 注释与代码保持同步

---

## 如何添加新工具

添加新工具类别（例如 `calendar`）：

### 步骤 1：添加 API 封装（如需要）

创建 `src/api/calendar.ts`：

```typescript
import type { SiYuanClient } from './client';

export async function getCalendarEvents(client: SiYuanClient, date: string) {
    return client.post('/api/calendar/getEvents', { date });
}
```

### 步骤 2：定义 Actions 和类型

添加到 `src/mcp/config.ts`：

```typescript
export const CALENDAR_ACTIONS = ['get_events', 'add_event', 'remove_event'] as const;
export type CalendarAction = typeof CALENDAR_ACTIONS[number];
```

添加模式到 `src/mcp/types.ts`：

```typescript
export const CalendarGetEventsSchema = z.object({
    action: z.literal("get_events"),
    date: z.string().describe("日期格式 YYYY-MM-DD"),
});
```

### 步骤 3：创建工具实现

创建 `src/mcp/tools/calendar.ts`：

```typescript
import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig } from '../config';
import type { PermissionManager } from '../permissions';
import { CalendarActionSchema } from '../types';
import { buildAggregatedTool, createActionSchema, createErrorResult, createJsonResult, type ActionVariant, type ToolResult } from './shared';

export const CALENDAR_TOOL_NAME = 'calendar';

export const CALENDAR_VARIANTS: ActionVariant<CalendarAction>[] = [
    {
        action: 'get_events',
        schema: createActionSchema('get_events', {
            date: { type: 'string', description: '日期格式 YYYY-MM-DD' },
        }, ['date'], '获取指定日期的日历事件。'),
    },
    // ... 更多 actions
];

export function listCalendarTools(config: CategoryToolConfig<CalendarAction>) {
    return buildAggregatedTool(
        CALENDAR_TOOL_NAME,
        '📅 日历操作。',
        config,
        CALENDAR_VARIANTS,
        {},
    );
}

export async function callCalendarTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<CalendarAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    // 实现
}
```

### 步骤 4：在服务器中注册

更新 `src/mcp/server.ts`：

```typescript
import { callCalendarTool, listCalendarTools } from './tools/calendar';

// 在 getToolsByConfig() 中：
return [
    // ... 现有工具
    ...listCalendarTools(config.calendar),
];

// 在 CallToolRequestSchema 处理器中：
case 'calendar': result = await callCalendarTool(client, args, config.calendar, permMgr); break;
```

### 步骤 5：添加默认配置

更新 `buildDefaultToolConfig()` in `src/mcp/config.ts`：

```typescript
return {
    // ... 现有类别
    calendar: {
        enabled: true,
        actions: createActionsRecord(CALENDAR_ACTIONS, ['get_events']),
    },
};
```

### 步骤 6：添加测试

创建 `tests/unit/calendar-tool.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { callCalendarTool } from '@/mcp/tools/calendar';

describe('calendar tool', () => {
    it('应该获取事件', async () => {
        // 测试实现
    });
});
```

---

## 如何添加新 Action

为现有工具添加 action（例如 `block`）：

### 步骤 1：添加 Action 到配置

更新 `src/mcp/config.ts`：

```typescript
export const BLOCK_ACTIONS = [
    // ... 现有 actions
    'my_new_action',
] as const;
```

### 步骤 2：定义模式

添加到 `src/mcp/types.ts`：

```typescript
export const BlockMyNewActionSchema = z.object({
    action: z.literal("my_new_action"),
    id: z.string().describe("块 ID"),
    option: z.string().optional().describe("可选参数"),
});
```

### 步骤 3：添加 Action 变体

更新 `src/mcp/tools/block.ts`：

```typescript
export const BLOCK_VARIANTS: ActionVariant<BlockAction>[] = [
    // ... 现有变体
    {
        action: 'my_new_action',
        schema: createActionSchema('my_new_action', {
            id: { type: 'string', description: '块 ID' },
            option: { type: 'string', description: '可选参数' },
        }, ['id'], '新 action 的描述。'),
    },
];
```

### 步骤 4：实现处理器

在 `src/mcp/tools/block.ts` 中添加处理器：

```typescript
const handleMyNewAction: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockMyNewActionSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;

    const result = await blockApi.myNewAction(client, parsed.id, parsed.option);
    return createJsonResult({ success: true, result });
};

// 在 BLOCK_ACTION_HANDLERS 中注册
const BLOCK_ACTION_HANDLERS: Record<BlockAction, BlockActionHandler> = {
    // ... 现有处理器
    my_new_action: handleMyNewAction,
};
```

### 步骤 5：默认启用（可选）

更新 `buildDefaultToolConfig()`：

```typescript
block: {
    enabled: true,
    actions: createActionsRecord(BLOCK_ACTIONS, [
        // ... 现有启用的 actions
        'my_new_action',
    ]),
},
```

---

## 调试技巧

### 思源远程调试

启用远程调试启动思源：

```bash
# macOS
/Applications/SiYuan.app/Contents/MacOS/SiYuan --remote-debugging-port=9222

# Windows
SiYuan.exe --remote-debugging-port=9222

# Linux
siyuan --remote-debugging-port=9222
```

然后打开 Chrome 并访问：
```
chrome://inspect/#devices
```

### MCP 客户端调试

启用调试日志：

```bash
export SIYUAN_MCP_DEBUG_ERRORS=1
```

这会在错误响应中包含堆栈跟踪。

### 查看日志

思源日志位置：
- **macOS**: `~/Library/Application Support/siyuan/temp/siyuan.log`
- **Windows**: `%APPDATA%/siyuan/temp/siyuan.log`
- **Linux**: `~/.config/siyuan/temp/siyuan.log`

### 常见问题

1. **工具未出现**: 检查配置中是否启用并重启服务器
2. **验证错误**: 验证 Zod 模式是否与输入匹配
3. **权限被拒绝**: 检查思源中的笔记本权限
4. **API 错误**: 验证思源内核是否运行并可访问

---

## 贡献指南

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 为新功能添加测试
5. 确保所有测试通过：`pnpm test`
6. 提交 Pull Request

如有问题，请使用 GitHub Issues。
