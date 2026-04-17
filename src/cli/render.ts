import type { ToolResult } from '../mcp/tools/shared';

export interface RenderOptions {
    json: boolean;
    debug: boolean;
}

const ANSI = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};

function color(stream: NodeJS.WriteStream, code: string, text: string): string {
    return stream.isTTY ? `${code}${text}${ANSI.reset}` : text;
}

/**
 * Write a ToolResult to stdout/stderr and return the correct exit code.
 * - --json: emit the raw JSON text (compact single-line if parseable) to stdout.
 * - default: attempt a light human-readable rendering, fall back to pretty JSON.
 */
export function renderToolResult(result: ToolResult, options: RenderOptions): number {
    const firstText = result.content[0]?.text ?? '';

    if (options.json) {
        return emitJson(firstText, result.isError);
    }

    let payload: unknown;
    try {
        payload = firstText ? JSON.parse(firstText) : null;
    } catch {
        // Text wasn't JSON; print as-is.
        process.stdout.write(firstText);
        if (!firstText.endsWith('\n')) process.stdout.write('\n');
        return result.isError ? 1 : 0;
    }

    if (result.isError) {
        renderError(payload);
        return 1;
    }

    renderSuccess(payload);
    return 0;
}

function emitJson(firstText: string, isError?: boolean): number {
    try {
        const parsed = JSON.parse(firstText);
        process.stdout.write(JSON.stringify(parsed) + '\n');
    } catch {
        process.stdout.write(firstText + (firstText.endsWith('\n') ? '' : '\n'));
    }
    return isError ? 1 : 0;
}

function renderError(payload: unknown): void {
    const out = process.stderr;
    if (isObject(payload) && isObject(payload.error)) {
        const err = payload.error as Record<string, unknown>;
        const type = typeof err.type === 'string' ? err.type : 'error';
        const message = typeof err.message === 'string' ? err.message : 'Unknown error';
        out.write(color(out, ANSI.red + ANSI.bold, `✗ [${type}] `) + message + '\n');

        if (isObject(err) && Array.isArray(err.fields)) {
            for (const field of err.fields as Array<Record<string, unknown>>) {
                const path = typeof field.path === 'string' ? field.path : '';
                const msg = typeof field.message === 'string' ? field.message : '';
                out.write(`  ${color(out, ANSI.yellow, path || '(field)')}: ${msg}\n`);
            }
        }

        if (typeof err.hint === 'string') {
            out.write(color(out, ANSI.dim, `  hint: ${err.hint}`) + '\n');
        }
        if (typeof err.details === 'string') {
            out.write(color(out, ANSI.dim, err.details) + '\n');
        }
        return;
    }

    out.write(color(out, ANSI.red + ANSI.bold, '✗ Error: ') + prettyJson(payload) + '\n');
}

function renderSuccess(payload: unknown): void {
    const out = process.stdout;

    if (typeof payload === 'string') {
        out.write(payload);
        if (!payload.endsWith('\n')) out.write('\n');
        return;
    }

    if (payload === null || payload === undefined) {
        out.write(color(out, ANSI.green, '✓ done') + '\n');
        return;
    }

    if (Array.isArray(payload)) {
        out.write(color(out, ANSI.cyan, `${payload.length} items`) + '\n');
        out.write(prettyJson(payload) + '\n');
        return;
    }

    if (!isObject(payload)) {
        out.write(prettyJson(payload) + '\n');
        return;
    }

    const obj = payload as Record<string, unknown>;

    // Paginated list: { data: [...], total, page, pageSize, pageCount, hasNextPage }
    if (Array.isArray(obj.data) && typeof obj.total === 'number' && typeof obj.page === 'number') {
        const { data, total, page, pageCount, pageSize } = obj as {
            data: unknown[]; total: number; page: number; pageCount: number; pageSize?: number;
        };
        const header = `${data.length} of ${total} items (page ${page}/${pageCount ?? '?'}${pageSize ? `, pageSize ${pageSize}` : ''})`;
        out.write(color(out, ANSI.cyan, header) + '\n');
        out.write(prettyJson(data) + '\n');
        if (obj.hasNextPage) {
            out.write(color(out, ANSI.dim, '  (more pages available — use --page N to fetch)') + '\n');
        }
        return;
    }

    // Simple success marker
    if (obj.success === true) {
        out.write(color(out, ANSI.green, '✓ success') + '\n');
        const rest = { ...obj };
        delete rest.success;
        if (Object.keys(rest).length > 0) {
            out.write(prettyJson(rest) + '\n');
        }
        return;
    }

    out.write(prettyJson(obj) + '\n');
}

function prettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
