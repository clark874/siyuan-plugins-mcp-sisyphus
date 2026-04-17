import minimist from 'minimist';

export type Command = 'dispatch' | 'list' | 'help' | 'init' | 'show-help' | 'version';

export interface ParsedArgs {
    command: Command;
    tool?: string;
    action?: string;
    rest: string[];
    configPath?: string;
    url?: string;
    token?: string;
    json: boolean;
    debug: boolean;
}

const HELP_TEXT = `siyuan — Direct command-line control for SiYuan Note

Usage:
  siyuan <tool> <action> [--flag value ...]   Execute a SiYuan operation
  siyuan list [tool]                           List tools or list a tool's actions
  siyuan help <tool> [action]                  Show detailed help for a tool or action
  siyuan init                                  Create ~/.siyuan-mcp/config.json
  siyuan --help | -h                           Show this help
  siyuan --version | -v                        Show version

Tools:
  notebook, document, block, av, file, search, tag, system, flashcard, mascot

Global options:
  --config <file>     Load config from <file> instead of ~/.siyuan-mcp/config.json
  --url <url>         SiYuan API base URL (default http://127.0.0.1:6806)
  --token <token>     SiYuan API token
  --json              Emit compact JSON (for scripts); default is pretty / human-readable
  --debug             Include stack traces and extra diagnostics

Examples:
  siyuan notebook list
  siyuan document create --notebook <id> --path "/Inbox/Test" --markdown "# Hello"
  siyuan block append --parent-id <id> --data-type markdown --data "- item"
  siyuan block get-kramdown --id <id>
  siyuan search fulltext --query "keyword" --page-size 10
  siyuan document list-tree --notebook <id> --json | jq '.data[].title'

Config precedence: CLI flags > environment variables > config file > defaults.
Environment: SIYUAN_API_URL, SIYUAN_TOKEN.

Flag naming:
  Use kebab-case or camelCase freely: --parent-id, --parentID, --parentId all work.
  Action names accept either form: set_open_state or set-open-state.
  Boolean flags: use --flag (true), --flag=false, or --no-flag.
  For complex object/array values, use --<key>-json '<json>'.
`;

const GLOBAL_BOOLEAN = ['json', 'debug', 'help', 'version'];
const GLOBAL_STRING = ['config', 'url', 'token'];

export function parseArgs(argv: string[]): ParsedArgs {
    const parsed = minimist(argv, {
        boolean: GLOBAL_BOOLEAN,
        string: GLOBAL_STRING,
        alias: { h: 'help', v: 'version' },
        stopEarly: false,
    });

    if (parsed.help) return blank('show-help');
    if (parsed.version) return blank('version');

    const positional = parsed._;
    const first = positional[0];

    if (first === 'init') {
        return {
            command: 'init',
            rest: [],
            configPath: parsed.config || undefined,
            url: parsed.url || undefined,
            token: parsed.token || undefined,
            json: Boolean(parsed.json),
            debug: Boolean(parsed.debug),
        };
    }

    if (first === 'list') {
        return {
            command: 'list',
            tool: typeof positional[1] === 'string' ? positional[1] : undefined,
            rest: [],
            configPath: parsed.config || undefined,
            url: parsed.url || undefined,
            token: parsed.token || undefined,
            json: Boolean(parsed.json),
            debug: Boolean(parsed.debug),
        };
    }

    if (first === 'help') {
        return {
            command: 'help',
            tool: typeof positional[1] === 'string' ? positional[1] : undefined,
            action: typeof positional[2] === 'string' ? positional[2] : undefined,
            rest: [],
            configPath: parsed.config || undefined,
            url: parsed.url || undefined,
            token: parsed.token || undefined,
            json: Boolean(parsed.json),
            debug: Boolean(parsed.debug),
        };
    }

    if (typeof first !== 'string' || !first) {
        return blank('show-help');
    }

    const action = typeof positional[1] === 'string' ? positional[1] : undefined;
    if (!action) {
        throw new Error(`Missing action for tool "${first}". Try "siyuan help ${first}".`);
    }

    // Everything after tool+action is the tool-specific flag payload.
    // We need to re-extract these from the original argv because minimist has
    // already parsed global flags, but we want flag-mapper to see them raw
    // alongside the tool-specific ones for schema-aware re-parsing.
    const rest = extractToolRest(argv);

    return {
        command: 'dispatch',
        tool: first,
        action,
        rest,
        configPath: parsed.config || undefined,
        url: parsed.url || undefined,
        token: parsed.token || undefined,
        json: Boolean(parsed.json),
        debug: Boolean(parsed.debug),
    };
}

function blank(command: Command): ParsedArgs {
    return { command, rest: [], json: false, debug: false };
}

/**
 * Return argv with the first two positionals (tool + action) and the four
 * global flags (--config / --url / --token / --json / --debug / --help / --version)
 * stripped. The remainder goes to the schema-aware tool-flag parser.
 */
function extractToolRest(argv: string[]): string[] {
    const out: string[] = [];
    let positionalSeen = 0;
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('-')) {
            positionalSeen++;
            if (positionalSeen <= 2) continue;
            out.push(token);
            continue;
        }

        const eq = token.indexOf('=');
        const flagName = eq === -1 ? token.replace(/^-+/, '') : token.slice(token.startsWith('--') ? 2 : 1, eq);

        if (GLOBAL_STRING.includes(flagName)) {
            if (eq === -1) i++; // consume the value token
            continue;
        }
        if (GLOBAL_BOOLEAN.includes(flagName) || flagName === 'h' || flagName === 'v') {
            // --help and --version accept no value; --json/--debug also valueless
            continue;
        }

        out.push(token);
    }
    return out;
}

export function getHelpText(): string {
    return HELP_TEXT;
}
