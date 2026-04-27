import { formatDangerousActionsList } from './config';

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

export function buildServerInstructions(userRulesText = ''): string {
    const dangerousActionsList = formatDangerousActionsList().join('\n');
    const formattedUserRules = formatUserRules(userRulesText);
    const userRulesPrioritySection = formattedUserRules
        ? `
## User custom rules priority

When applicable, you MUST follow these user custom rules as a higher-priority preference layer than the general usage suggestions below.
- If a user custom rule conflicts with a general recommendation in these instructions, follow the user custom rule unless that would violate a safety or confirmation requirement.
- Before calling tools or generating SiYuan content, quickly check whether the action should follow one of these user custom rules.

## User custom rules

${formattedUserRules}
`
        : '';
    const userRulesReminder = formattedUserRules
        ? '\nUser custom rules override the general style and workflow suggestions below when they apply.\n'
        : '';
    return `
${userRulesPrioritySection}

## Help and progressive disclosure

Each tool exposes common actions in its description. For detailed help on any action (including advanced ones):
- Read MCP resources: siyuan://help/action/{tool}/{action}, siyuan://help/tool-overview, siyuan://help/document-path-semantics, siyuan://help/examples, siyuan://help/ai-layout-guide
- If your client cannot read siyuan:// resources, call any tool with action=”help” to get the same guidance (actions, required fields, hints, and examples).

## Path semantics (critical — the most common error source)

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
