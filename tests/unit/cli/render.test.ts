import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolResult } from '@/tools/shared';
import { extractPaginationInfo, renderCliError, renderToolResult } from '@/cli/render';

function captureStdIO() {
    let stdout = '';
    let stderr = '';

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
    }) as typeof process.stdout.write);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
    }) as typeof process.stderr.write);

    return {
        get stdout() { return stdout; },
        get stderr() { return stderr; },
        restore() {
            stdoutSpy.mockRestore();
            stderrSpy.mockRestore();
        },
    };
}

describe('cli/render', () => {
    const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const stderrTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

    beforeEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
        Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: false });
    });

    afterEach(() => {
        if (stdoutTTY) Object.defineProperty(process.stdout, 'isTTY', stdoutTTY);
        if (stderrTTY) Object.defineProperty(process.stderr, 'isTTY', stderrTTY);
    });

    it('keeps --json output compact for script usage', () => {
        const io = captureStdIO();
        const result: ToolResult = {
            content: [{ type: 'text', text: '{\n  "ok": true,\n  "count": 2\n}' }],
        };

        const code = renderToolResult(result, { json: true, debug: false });

        expect(code).toBe(0);
        expect(io.stdout).toBe('{"ok":true,"count":2}\n');
        expect(io.stderr).toBe('');
        io.restore();
    });

    it('renders paginated data as summary plus list', () => {
        const io = captureStdIO();
        const result: ToolResult = {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    data: [
                        { id: 'doc-1', title: 'Daily Note', path: '/Daily Note' },
                        { id: 'doc-2', title: 'Weekly Note', path: '/Weekly Note' },
                    ],
                    total: 5,
                    page: 1,
                    pageCount: 3,
                    pageSize: 2,
                    hasNextPage: true,
                }),
            }],
        };

        const code = renderToolResult(result, { json: false, debug: false });

        expect(code).toBe(0);
        expect(io.stdout).toContain('✓ 2 of 5 items · page 1/3');
        expect(io.stdout).toContain('Page Size');
        expect(io.stdout).toContain('Has Next Page');
        expect(io.stdout).toContain(': 2');
        expect(io.stdout).toContain(': true');
        expect(io.stdout).toContain('Items');
        expect(io.stdout).toContain('ID: doc-1 · Title: Daily Note · Path: /Daily Note');
        expect(io.stdout).toContain('Next Step');
        expect(io.stdout).toContain('Enter/n for next page');
        io.restore();
    });

    it('shows the full MCP page for paginated output', () => {
        const io = captureStdIO();
        const data = Array.from({ length: 12 }, (_, index) => ({
            id: `doc-${index + 1}`,
            title: `Doc ${index + 1}`,
            path: `/Doc ${index + 1}`,
        }));
        const result: ToolResult = {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    data,
                    total: 24,
                    page: 1,
                    pageCount: 2,
                    pageSize: 12,
                    hasNextPage: true,
                }),
            }],
        };

        const code = renderToolResult(result, { json: false, debug: false });

        expect(code).toBe(0);
        expect(io.stdout).toContain('ID: doc-12 · Title: Doc 12 · Path: /Doc 12');
        expect(io.stdout).not.toContain('more item(s) not shown');
        io.restore();
    });

    it('extracts pagination metadata from tool results', () => {
        const result: ToolResult = {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    data: [{ id: 'doc-1' }],
                    total: 3,
                    page: 2,
                    pageCount: 3,
                    pageSize: 1,
                    hasNextPage: true,
                }),
            }],
        };

        expect(extractPaginationInfo(result)).toEqual({
            page: 2,
            pageCount: 3,
            hasNextPage: true,
        });
    });

    it('formats structured help payloads for terminal reading', () => {
        const io = captureStdIO();
        const result: ToolResult = {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    tool: 'document',
                    action: 'create',
                    hint: 'Use notebook + path + markdown, then verify with document(action="get_path", id="...").',
                    shapes: ['notebook + path + markdown'],
                    requiredFields: ['notebook', 'path', 'markdown'],
                    example: { action: 'create', notebook: 'nb', path: '/Inbox/Test', markdown: '# Hello' },
                    guidance: ['Parent paths must already exist. Use document(action="get_ids", notebook="nb", path="/Inbox/Test") to resolve IDs.'],
                    requiresConfirmation: false,
                    fullDocResource: 'siyuan://help/action/document/create',
                }),
            }],
        };

        renderToolResult(result, { json: false, debug: false });

        expect(io.stdout).toContain('document create');
        expect(io.stdout).toContain('Use --notebook + --path + --markdown');
        expect(io.stdout).toContain('siyuan-sisyphus document get-path --id ...');
        expect(io.stdout).toContain('Accepted Shapes');
        expect(io.stdout).toContain('--notebook + --path + --markdown');
        expect(io.stdout).toContain('Required Fields');
        expect(io.stdout).toContain('--notebook, --path, --markdown');
        expect(io.stdout).toContain('siyuan-sisyphus document create --notebook nb --path /Inbox/Test --markdown "# Hello"');
        expect(io.stdout).toContain('siyuan-sisyphus document get-ids --notebook nb --path /Inbox/Test');
        expect(io.stdout).toContain('Resource: siyuan-sisyphus help document create');
        io.restore();
    });

    it('renders validation errors with fields and hints', () => {
        const io = captureStdIO();
        const result: ToolResult = {
            isError: true,
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        type: 'validation',
                        message: 'Invalid arguments.',
                        fields: [
                            { path: 'query', message: 'query is required.' },
                            { path: 'pageSize', message: 'must be positive.' },
                        ],
                        hint: 'Verify the block ID with block(action="info", id="...") or locate it via search(action="fulltext", query="...").',
                        details: 'Expected query/pageSize to be valid.',
                    },
                }),
            }],
        };

        const code = renderToolResult(result, { json: false, debug: false });

        expect(code).toBe(1);
        expect(io.stderr).toContain('✗ [validation] Invalid arguments.');
        expect(io.stderr).toContain('Fields');
        expect(io.stderr).toContain('query — query is required.');
        expect(io.stderr).toContain('pageSize — must be positive.');
        expect(io.stderr).toContain('Hint');
        expect(io.stderr).toContain('siyuan-sisyphus block info --id ...');
        expect(io.stderr).toContain('siyuan-sisyphus search fulltext --query ...');
        expect(io.stderr).toContain('Details');
        expect(io.stderr).toContain('--query / --page-size');
        io.restore();
    });

    it('emits translated JSON for CLI help payloads', () => {
        const io = captureStdIO();
        const result: ToolResult = {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    tool: 'block',
                    commonActions: ['append'],
                    advancedActions: [],
                    guidance: ['block(action="append") with a document ID targets the document end.'],
                    actionSummaries: {
                        append: 'requires: dataType, data, parentID',
                    },
                    detailsHint: 'Call block(action="help", topic="<actionName>") for required fields.',
                }),
            }],
        };

        renderToolResult(result, { json: true, debug: false });

        expect(JSON.parse(io.stdout)).toMatchObject({
            guidance: ['siyuan-sisyphus block append with a document ID targets the document end.'],
            actionSummaries: {
                append: 'requires: --data-type, --data, --parent-id',
            },
            detailsHint: 'Call siyuan-sisyphus help block <action-name> for required fields.',
        });
        io.restore();
    });

    it('uses the shared CLI error renderer for plain failures', () => {
        const io = captureStdIO();

        renderCliError(new Error('Unknown action "oops".'));

        expect(io.stderr).toContain('✗ Unknown action "oops".');
        io.restore();
    });
});
