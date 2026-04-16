# Development Guide

This guide helps developers understand and contribute to the SiYuan MCP Sisyphus project.

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Build System](#build-system)
3. [Development Workflow](#development-workflow)
4. [Testing](#testing)
5. [Code Conventions](#code-conventions)
6. [Adding New Tools](#adding-new-tools)
7. [Adding New Actions](#adding-new-actions)
8. [Debugging](#debugging)

---

## Development Environment Setup

### Prerequisites

- **Node.js**: Version 20.x or higher (see `engines` in package.json)
- **pnpm**: Package manager (install via `npm install -g pnpm`)
- **SiYuan Note**: Installed locally for testing

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus

# Install dependencies
pnpm install
```

### Project Structure

```
siyuan-plugins-mcp-sisyphus/
├── src/
│   ├── index.ts              # Plugin entry point (UI)
│   ├── mcp/
│   │   ├── server.ts         # MCP server entry
│   │   ├── config.ts         # Tool configuration
│   │   ├── types.ts          # Zod schemas for all actions
│   │   ├── permissions.ts    # Permission management
│   │   ├── tools/            # Tool implementations
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
│   │   │   ├── shared.ts     # Shared utilities
│   │   │   └── context.ts    # Context resolution
│   │   ├── resources.ts      # MCP resources
│   ├── api/                  # SiYuan API wrappers
│   │   ├── client.ts
│   │   ├── block.ts
│   │   ├── document.ts
│   │   └── ...
│   ├── components/           # Svelte UI components
│   └── libs/                 # Utility libraries
├── tests/                    # Test suite
├── public/i18n/              # Localization files
├── dist/                     # Production build output
└── dev/                      # Development build output
```

---

## Build System

### Vite Configuration

The project uses Vite with a multi-entry configuration (`vite.config.ts`):

```typescript
// Key configuration points
export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),  // Path alias
        }
    },
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, "src/index.ts"),
                "mcp-server": resolve(__dirname, "src/mcp/server.ts"),
            },
            formats: ["cjs"],  // CommonJS output
        },
        rollupOptions: {
            external: ["siyuan", "process", "path", "fs", /* ... */],
        }
    }
});
```

**Key Features:**
- **Multi-entry**: Builds both plugin UI (`index.js`) and MCP server (`mcp-server.cjs`)
- **Output Format**: CommonJS (CJS) for Node.js compatibility
- **Path Alias**: `@/*` maps to `src/*`
- **External Dependencies**: Node.js built-ins and SiYuan API are externalized

### TypeScript Configuration

`tsconfig.json`:
- Target: ESNext
- Module: ESNext
- Module Resolution: Node
- Path aliases: `@/*` and `@/libs/*`
- Includes: `src/**/*.ts`, `tests/**/*.ts`

### Svelte Configuration

`svelte.config.js`:
- Preprocessor: `vitePreprocess()`
- Suppressed warnings for accessibility rules (a11y)

---

## Development Workflow

### Available Scripts

```bash
# Development mode (watch)
pnpm dev

# Production build
pnpm build

# Create development link to SiYuan
pnpm make-link

# Generate installable package
pnpm make-install
```

### Development Mode

```bash
pnpm dev
```

- Enables watch mode with inline source maps
- Outputs to `dev/` directory
- Automatically rebuilds on file changes
- Does NOT auto-reload SiYuan (manual refresh required)

### Production Build

```bash
pnpm build
```

- Outputs to `dist/` directory
- Generates:
  - `dist/index.js` - Plugin UI bundle
  - `dist/mcp-server.cjs` - MCP server bundle
  - `dist/index.css` - Styles
  - `package.zip` - Complete installable package

### Linking to SiYuan

```bash
# macOS/Linux
pnpm make-link

# Windows
pnpm make-link-win
```

This creates a symbolic link from the SiYuan plugins directory to your dev folder.

### Creating Install Package

```bash
pnpm make-install
```

Builds and packages the plugin for distribution.

---

## Testing

### Test Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage report
pnpm test:coverage

# Live smoke test (requires running SiYuan)
pnpm test:smoke
```

### Test Structure

```
tests/
├── setup.ts                  # Test environment setup
├── mocks/
│   └── siyuan.ts            # SiYuan API mocks
├── unit/                    # Unit tests
│   ├── client.test.ts
│   ├── error.test.ts
│   ├── tool-config.test.ts
│   └── ...
└── integration/             # Integration tests
    ├── mcp-e2e.test.ts
    ├── server.test.ts
    └── http-concurrency.test.ts
```

### Writing Tests

Tests use Vitest with the following pattern:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from '@/mcp/tools/my-tool';

describe('my-tool', () => {
    it('should handle valid input', async () => {
        const result = await myFunction({ action: 'test' });
        expect(result.content[0].text).toContain('success');
    });

    it('should handle errors gracefully', async () => {
        const result = await myFunction({ action: 'invalid' });
        expect(result.isError).toBe(true);
    });
});
```

### Test Setup

The `tests/setup.ts` file:
- Preserves original `fetch` global
- Restores mocks after each test

---

## Code Conventions

### Directory Structure Conventions

1. **API Layer** (`src/api/`)
   - One file per SiYuan API domain
   - Pure functions that wrap SiYuan kernel APIs
   - Return raw API responses

2. **Tool Layer** (`src/mcp/tools/`)
   - One file per tool category
   - Action handlers implement business logic
   - Handle permissions and UI refresh

3. **Type Definitions** (`src/mcp/types.ts`)
   - All Zod schemas for action parameters
   - One schema per action
   - Use `.superRefine()` for complex validation

4. **Configuration** (`src/mcp/config.ts`)
   - Tool category definitions
   - Action lists and tiers
   - Default configurations

### Error Handling Pattern

```typescript
// Use shared error utilities
import { createErrorResult, createJsonResult } from './shared';

try {
    const result = await apiCall();
    return createJsonResult({ success: true, data: result });
} catch (error) {
    return createErrorResult(error, { tool: 'my-tool', action: 'my-action', rawArgs });
}
```

### TypeScript Type Definitions

- Prefer `interface` over `type` for object shapes
- Use `const` assertions for action arrays
- Export types from `types.ts`
- Use Zod for runtime validation

### Code Comments

- Document complex business logic
- Explain non-obvious workarounds
- Use JSDoc for public functions
- Keep comments current with code changes

---

## Adding New Tools

To add a new tool category (e.g., `calendar`):

### Step 1: Add API Wrapper (if needed)

Create `src/api/calendar.ts`:

```typescript
import type { SiYuanClient } from './client';

export async function getCalendarEvents(client: SiYuanClient, date: string) {
    return client.post('/api/calendar/getEvents', { date });
}
```

### Step 2: Define Actions and Types

Add to `src/mcp/config.ts`:

```typescript
export const CALENDAR_ACTIONS = ['get_events', 'add_event', 'remove_event'] as const;
export type CalendarAction = typeof CALENDAR_ACTIONS[number];
```

Add schemas to `src/mcp/types.ts`:

```typescript
export const CalendarGetEventsSchema = z.object({
    action: z.literal("get_events"),
    date: z.string().describe("Date in YYYY-MM-DD format"),
});
```

### Step 3: Create Tool Implementation

Create `src/mcp/tools/calendar.ts`:

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
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        }, ['date'], 'Get calendar events for a date.'),
    },
    // ... more actions
];

export function listCalendarTools(config: CategoryToolConfig<CalendarAction>) {
    return buildAggregatedTool(
        CALENDAR_TOOL_NAME,
        '📅 Calendar operations.',
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
    // Implementation
}
```

### Step 4: Register in Tool Registry

Update `src/mcp/tool-registry.ts`:

```typescript
import { callCalendarTool, listCalendarTools } from './tools/calendar';

export const TOOL_REGISTRY: Record<ToolCategory, ToolModule> = {
    // ... existing tools
    calendar: { category: 'calendar', listTools: listCalendarTools as ToolModule['listTools'], callTool: callCalendarTool as ToolModule['callTool'] },
};
```

### Step 5: Add Default Config

Update `buildDefaultToolConfig()` in `src/mcp/config.ts`:

```typescript
return {
    // ... existing categories
    calendar: {
        enabled: true,
        actions: createActionsRecord(CALENDAR_ACTIONS, ['get_events']),
    },
};
```

### Step 6: Add Tests

Create `tests/unit/calendar-tool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { callCalendarTool } from '@/mcp/tools/calendar';

describe('calendar tool', () => {
    it('should get events', async () => {
        // Test implementation
    });
});
```

---

## Adding New Actions

To add an action to an existing tool (e.g., `block`):

### Step 1: Add Action to Config

Update `src/mcp/config.ts`:

```typescript
export const BLOCK_ACTIONS = [
    // ... existing actions
    'my_new_action',
] as const;
```

### Step 2: Define Schema

Add to `src/mcp/types.ts`:

```typescript
export const BlockMyNewActionSchema = z.object({
    action: z.literal("my_new_action"),
    id: z.string().describe("Block ID"),
    option: z.string().optional().describe("Optional parameter"),
});
```

### Step 3: Add Action Variant

Update `src/mcp/tools/block.ts`:

```typescript
export const BLOCK_VARIANTS: ActionVariant<BlockAction>[] = [
    // ... existing variants
    {
        action: 'my_new_action',
        schema: createActionSchema('my_new_action', {
            id: { type: 'string', description: 'Block ID' },
            option: { type: 'string', description: 'Optional parameter' },
        }, ['id'], 'Description of the new action.'),
    },
];
```

### Step 4: Implement Handler

Add handler in `src/mcp/tools/block.ts`:

```typescript
const handleMyNewAction: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockMyNewActionSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;

    const result = await blockApi.myNewAction(client, parsed.id, parsed.option);
    return createJsonResult({ success: true, result });
};

// Register in BLOCK_ACTION_HANDLERS
const BLOCK_ACTION_HANDLERS: Record<BlockAction, BlockActionHandler> = {
    // ... existing handlers
    my_new_action: handleMyNewAction,
};
```

### Step 5: Enable by Default (Optional)

Update `buildDefaultToolConfig()`:

```typescript
block: {
    enabled: true,
    actions: createActionsRecord(BLOCK_ACTIONS, [
        // ... existing enabled actions
        'my_new_action',
    ]),
},
```

---

## Debugging

### SiYuan Remote Debugging

Start SiYuan with remote debugging enabled:

```bash
# macOS
/Applications/SiYuan.app/Contents/MacOS/SiYuan --remote-debugging-port=9222

# Windows
SiYuan.exe --remote-debugging-port=9222

# Linux
siyuan --remote-debugging-port=9222
```

Then open Chrome and navigate to:
```
chrome://inspect/#devices
```

### MCP Client Debugging

Enable debug logging:

```bash
export SIYUAN_MCP_DEBUG_ERRORS=1
```

This includes stack traces in error responses.

### Viewing Logs

SiYuan logs are available in:
- **macOS**: `~/Library/Application Support/siyuan/temp/siyuan.log`
- **Windows**: `%APPDATA%/siyuan/temp/siyuan.log`
- **Linux**: `~/.config/siyuan/temp/siyuan.log`

### Common Issues

1. **Tool not appearing**: Check if enabled in config and server restarted
2. **Validation errors**: Verify Zod schema matches input
3. **Permission denied**: Check notebook permissions in SiYuan
4. **API errors**: Verify SiYuan kernel is running and accessible

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `pnpm test`
6. Submit a pull request

For questions or issues, please use GitHub Issues.
