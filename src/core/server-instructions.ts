import { AGENT_MEMORY_STALE_AFTER_DAYS, formatDangerousActionsList } from './config';

function formatUserRules(userRulesText = ''): string {
    const normalizedUserRules = typeof userRulesText === 'string' ? userRulesText.trim() : '';
    if (!normalizedUserRules) return '';

    const lines = normalizedUserRules
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return '';

    return lines.map(line => `- ${line}`).join('\n');
}

export interface ServerInstructionInput {
    userRulesText?: string;
    agentSiyuanMemoryText?: string;
    agentSiyuanMemoryUpdatedAt?: string;
}

function normalizeInstructionInput(input: string | ServerInstructionInput = '', agentSiyuanMemoryText = ''): Required<ServerInstructionInput> {
    if (typeof input === 'string') {
        return {
            userRulesText: input,
            agentSiyuanMemoryText,
            agentSiyuanMemoryUpdatedAt: '',
        };
    }
    return {
        userRulesText: typeof input.userRulesText === 'string' ? input.userRulesText : '',
        agentSiyuanMemoryText: typeof input.agentSiyuanMemoryText === 'string' ? input.agentSiyuanMemoryText : '',
        agentSiyuanMemoryUpdatedAt: typeof input.agentSiyuanMemoryUpdatedAt === 'string' ? input.agentSiyuanMemoryUpdatedAt : '',
    };
}

function getAgentMemoryStatus(memoryText: string, updatedAt: string): {
    status: 'missing' | 'fresh' | 'stale';
    updatedAtLabel: string;
    ageLabel: string;
} {
    if (!memoryText.trim()) {
        return {
            status: 'missing',
            updatedAtLabel: 'not created',
            ageLabel: 'unknown',
        };
    }

    const updatedTime = Date.parse(updatedAt);
    if (!updatedAt.trim() || Number.isNaN(updatedTime)) {
        return {
            status: 'stale',
            updatedAtLabel: updatedAt.trim() ? `${updatedAt} (invalid)` : 'unknown',
            ageLabel: 'unknown',
        };
    }

    const ageMs = Date.now() - updatedTime;
    const ageDays = Math.max(0, Math.floor(ageMs / 86_400_000));
    return {
        status: ageDays > AGENT_MEMORY_STALE_AFTER_DAYS ? 'stale' : 'fresh',
        updatedAtLabel: new Date(updatedTime).toISOString(),
        ageLabel: `${ageDays} day${ageDays === 1 ? '' : 's'}`,
    };
}

export function buildServerInstructions(input: string | ServerInstructionInput = '', agentSiyuanMemoryText = ''): string {
    const instructionInput = normalizeInstructionInput(input, agentSiyuanMemoryText);
    const dangerousActionsList = formatDangerousActionsList().join('\n');
    const formattedUserRules = formatUserRules(instructionInput.userRulesText);
    const normalizedAgentMemory = instructionInput.agentSiyuanMemoryText.trim();
    const agentMemoryStatus = getAgentMemoryStatus(normalizedAgentMemory, instructionInput.agentSiyuanMemoryUpdatedAt);
    const userRulesPrioritySection = formattedUserRules
        ? `
# Active user custom rules

These user custom rules are active for this MCP session. Apply them before choosing tools or generating SiYuan content.
- User custom rules are a higher-priority preference layer than the general usage suggestions below.
- User custom rules do not override safety confirmation requirements, notebook permissions, disabled tools, or disabled actions.
- If a user custom rule conflicts with a general recommendation in these instructions, follow the user custom rule unless it would violate one of those hard limits.
- If the configured rules change, the client must reconnect or the MCP HTTP server must restart before updated rules enter initialize-time instructions.
- To re-check the current configured rules, read \`siyuan://help/user-rules\`.

## Rule list

${formattedUserRules}
`
        : '';
    const agentMemoryAction = agentMemoryStatus.status === 'missing'
        ? '- The virtual memory file has not been initialized. Before doing workspace-aware planning or assuming notebook structure, ask the user whether to create `/AGENTS.md`; if they agree, inspect the workspace with `fs`/search, then write a concise initialization memory.'
        : agentMemoryStatus.status === 'stale'
            ? `- The memory is stale because it is older than ${AGENT_MEMORY_STALE_AFTER_DAYS} days or has no valid update time. Before relying on it for workspace-aware work, ask the user whether to refresh \`/AGENTS.md\`; if they agree, verify current state first, then update it.`
            : '- The memory is fresh enough to use as startup context, but still verify details before high-impact edits.';
    const agentMemorySection = `
# Agent siyuan memory

This is an AI-maintained summary of the current SiYuan workspace state, stored as the virtual fs file \`/AGENTS.md\`. Use it as startup context before browsing notes, but treat it as lower priority than user requests, active user custom rules, safety confirmation requirements, notebook permissions, disabled tools, and disabled actions.
- Status: ${agentMemoryStatus.status}
- Last updated: ${agentMemoryStatus.updatedAtLabel}
- Approximate age: ${agentMemoryStatus.ageLabel}
- Stale threshold: ${AGENT_MEMORY_STALE_AFTER_DAYS} days
${agentMemoryAction}
- Do not silently create or update \`/AGENTS.md\` without user consent when the memory is missing or stale.

## What to write in /AGENTS.md

Keep this memory concise and durable. Prefer facts that help future agents orient quickly:
- Workspace map: important notebooks, root folders, dashboards, inboxes, archives, and where active work lives.
- Current projects: active project names, key documents, status, next likely entry points, and known open questions.
- User preferences learned from notes: naming conventions, icon/layout habits, language defaults, tagging style, and database usage.
- Operating cautions: sensitive notebooks to avoid, workflows that require confirmation, conventions that prevent duplicate or misplaced notes.
- Maintenance notes: what was inspected before updating the memory and which areas may still be stale.

Avoid secrets, private credentials, long transcripts, volatile one-off task details, and facts you have not verified. Update this file through \`fs.write\` or \`fs.replace\` after the user agrees.

## Current memory

${normalizedAgentMemory || '(not created yet)'}
`;
    const userRulesReminder = formattedUserRules
        ? '\nActive user custom rules override the general style and workflow suggestions below when they apply. Re-check siyuan://help/user-rules if current preferences matter.\n'
        : '';
    return `
${userRulesPrioritySection}
${agentMemorySection}

## Help and progressive disclosure

Each tool exposes common actions in its description. For detailed help on any action (including advanced ones):
- Read MCP resources: siyuan://help/action/{tool}/{action}, siyuan://help/tool-overview, siyuan://help/document-path-semantics, siyuan://help/examples, siyuan://help/ai-layout-guide
- Read siyuan://help/user-rules when user-specific preferences may affect tool choice, naming, formatting, icon behavior, or content style.
- If your client cannot read siyuan:// resources, call any tool with action=”help” to get the same guidance (actions, required fields, hints, and examples).

## Path semantics (critical — the most common error source)

For basic path-style notebook and document operations, use \`fs\` whenever the task can be expressed with a human-readable workspace path. Treat \`fs\` as the default virtual filesystem interface:
- List direct children: \`fs(action="ls", path="/Notebook/Folder")\`
- List a recursive tree: \`fs(action="tree", path="/Notebook/Folder")\`
- Read Markdown: \`fs(action="read", path="/Notebook/Folder/Doc")\`
- Create or overwrite a document body: \`fs(action="write", path="/Notebook/Folder/Doc", markdown="...", overwrite=true)\`
- Replace exact text in one document: \`fs(action="replace", path="/Notebook/Folder/Doc", edit={ old: "...", new: "..." })\`
- Search Markdown under a path: \`fs(action="search", path="/Notebook/Folder", query="...")\`
- Delete, move, or rename by path: \`fs(action="rm", path="/Notebook/Folder/Doc")\`, \`fs(action="mv", from="/Notebook/Old", to="/Notebook/New")\` after explicit confirmation.

\`fs\` paths are human-readable workspace paths and \`fs\` hides notebook IDs, block IDs, and storage paths. Prefer \`fs\` for basic browse/read/write/edit/search/move/delete workflows. Use the lower-level \`document\`, \`block\`, \`search\`, and \`av\` tools only when you need SiYuan-specific block layout, metadata, SQL, backlinks, assets, database operations, or direct block IDs.

There are exactly two path types. Do not mix them.

| Type | Used by | Example |
|------|---------|---------|
| Human-readable | document(action=”create”), document(action=”lookup”, hpath=...) | /Inbox/Weekly Note |
| Storage path | document(action=”rename”), remove, move, lookup (with notebook+path) | /20240318112233-abc123.sy |

Safe workflow: call document(action=”lookup”, id=..., include=[”path”]) first, then reuse the returned storage path.

WRONG: document(action=”rename”, notebook=”...”, path=”/Inbox/Weekly Note”, title=”New Title”) — this will fail because rename expects a storage path, not a human-readable path.
CORRECT: document(action=”rename”, notebook=”...”, path=”/20240318112233-abc123.sy”, title=”New Title”)

## High-risk operations confirmation

Before calling any of the following actions, you MUST clearly describe the action to the user and wait for explicit confirmation. Do not call them without user confirmation.

**Actions that require confirmation:**
${dangerousActionsList}
- \`file(action=”export_resources”, outputPath=...)\`

Flow: State “I will do X. Proceed?” and only call the tool after the user explicitly agrees.

Additional rules:
- file(action=”upload_asset”) reads a local file path and uploads it into SiYuan assets. Treat this as high-risk.
- If file(action=”upload_asset”) targets a file larger than the configured large-upload threshold (10 MB by default), you MUST stop, tell the user, and only retry after explicit confirmation using confirmLargeFile=true.
- file(action=”export_resources”) without outputPath only generates a ZIP in SiYuan's managed temp area.
- file(action=”export_resources”, outputPath=...) writes to the local filesystem and MUST be treated as high-risk.

## Block insertion semantics

- block(action=”prepend”) with a document ID inserts at the start of the document.
- block(action=”append”) with a document ID inserts at the end of the document.
- With a block ID, prepend/append operate on that block's child list.
- block(action=”update”) is best for single-block replacement. Multi-line markdown may be truncated to the first line by SiYuan; use block(action=”append”), prepend, or insert when you need multiple blocks, tables, or longer multi-line content.

## Tag creation semantics

- There is no direct create action for tags.
- To create a real SiYuan tag in block markdown, use #tag# with both leading and trailing # characters. Hierarchical: #project/phase#.
- Example: block(action=”update”, dataType=”markdown”, data=”#holiday# #home#”)

## Flashcard semantics

- To turn a block into a flashcard, prefer flashcard(action=”create_card”), which writes “custom-riff-decks” and registers the riff card together.
- block(action=”set_attrs”) with “custom-riff-decks” only writes the metadata binding and is not the full “make flashcard” workflow by itself.
- Common pattern: h2 heading as the question, following blocks as the answer.
- Cloze: \`==answer==\` is treated as a cloze answer in flashcard review.
- For scheduled review and deck operations, prefer the dedicated \`flashcard\` tool.

## SiYuan layout model (summary)

When the user asks for polished SiYuan content, consider native layout features instead of plain paragraphs:
1. Start with headings, paragraphs, lists, task lists, blockquotes, callouts, tables, math blocks, and code blocks.
2. When the user asks for a diary entry, journal, daily log, or today’s note in a notebook, prefer \`document(action="create_daily_note")\` instead of manually creating a dated path and then appending content.
3. For side-by-side comparison, cards, or dashboards, use Kramdown super blocks (\`{{{col\` / \`{{{row\`).
4. For metadata, workflow markers, or styling, use block attributes (\`name\`, \`alias\`, \`memo\`, \`bookmark\`, \`custom-*\`, \`style\`).
5. For diagrams, charts, mind maps, use renderer code blocks (\`mindmap\`, \`mermaid\`, \`flowchart\`, \`graphviz\`, \`plantuml\`, \`echarts\`, \`abc\`).
6. For playback, embeds, dynamic queries, or structured records, use \`video\`, \`audio\`, \`iframe\`, \`html\`, \`query_embed\`, or database blocks \`av\`.
7. For real database operations, prefer the dedicated \`av\` tool instead of describing an \`av\` block abstractly.

Critical anti-patterns — do NOT:
- Use \`::: row\`, raw HTML \`<div>\`, or \`===\` separators as super block substitutes.
- Confuse Markdown tables with database blocks, or bookmarks (block attributes) with tags (inline markdown).
- Fake database blocks with Markdown tables when a real \`av\` workflow is required.
- Claim that a real \`av\` block exists after only initializing AV metadata without materializing the NodeAttributeView block into the document tree.

For the full layout guide with formatting inventory, distinctions, and daily heuristics, read siyuan://help/ai-layout-guide or call any tool with action=”help”.

## Usage semantics

- Bookmarks = collecting existing blocks (block attributes). Tags = inline markdown \`#tag#\`. Do not confuse them.
- Flashcards are review semantics, not layout. Layout choice and flashcard marking are separate concerns.
- Through MCP, prefer creating content directly instead of describing UI-only steps like \`/AI 编写\`.
${userRulesReminder}
`;
}
