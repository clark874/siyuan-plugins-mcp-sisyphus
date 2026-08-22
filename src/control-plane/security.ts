import { sha256Hex } from '../shared/crypto';

export const PLUGIN_STORAGE_ROOT = '/data/storage/petal';
export const MAX_PLUGIN_FILE_BYTES = 128 * 1024;
export const MAX_PLUGIN_OUTPUT_CHARS = 32_000;
export const MAX_PLUGIN_LIST_ENTRIES = 200;
export const MAX_PLUGIN_LIST_DEPTH = 4;

const SENSITIVE_KEY = /token|password|passwd|secret|api[_-]?key|apikey|cookie|authorization|auth[_-]?code|authcode|private[_-]?key|privatekey|access[_-]?key|accesskey|client[_-]?secret|clientsecret/i;
const SENSITIVE_FILE = /(?:^|[._-])(\.env|credentials?|secrets?|tokens?|cookies?|private[_-]?keys?|id_rsa)(?:$|[._-])/i;
const BINARY_EXTENSION = /\.(?:db|sqlite|sqlite3|zip|gz|7z|rar|tar|pdf|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|wasm|dylib|so|dll|exe|bin)$/i;
const ALLOWED_TEXT_EXTENSION = /\.(?:json|json5|ya?ml|toml|ini|conf|config|txt|md|css|scss|less|js|mjs|cjs|ts|xml|csv)$/i;
const SECRET_TEXT_PATTERNS = [
    /-----BEGIN (?:(?:RSA|EC|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/i,
    /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{16,}\b/,
    /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
    /\bAIza[A-Za-z0-9_-]{30,}\b/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}\b/i,
    /\b(?:token|password|passwd|secret|api[_-]?key|cookie|authorization)\b\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{8,}/i,
];
const PRIVATE_KEY_BLOCK_PATTERN = /-----BEGIN ((?:(?:RSA|EC|OPENSSH|ENCRYPTED) )?PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/gi;
const SENSITIVE_ASSIGNMENT_VALUE_PATTERN = /\b(?:token|password|passwd|secret|api[_-]?key|cookie|authorization)\b\s*[:=]\s*(?:(["'])([^\r\n"']{8,})\1|([A-Za-z0-9._~+\/-]{8,}))/gi;

export function normalizePluginRelativePath(path: string | undefined): string {
    const value = path?.trim() ?? '';
    if (value === '') return '';
    if (value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
        throw new Error('Plugin storage path must be a safe relative path.');
    }
    const segments = value.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
        throw new Error('Plugin storage path contains an unsafe segment.');
    }
    return segments.join('/');
}

export function assertSafePluginName(name: string): string {
    const value = name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value === '.' || value === '..') {
        throw new Error('Invalid installed plugin name.');
    }
    return value;
}

export function assertReadablePluginFile(path: string): void {
    const name = path.split('/').at(-1) ?? '';
    if (SENSITIVE_FILE.test(name)) {
        throw new Error('Sensitive credential-like files cannot be read through MCP.');
    }
    if (BINARY_EXTENSION.test(name)) {
        throw new Error('Binary, database, archive, and executable files cannot be read through MCP.');
    }
    if (name.includes('.') && !ALLOWED_TEXT_EXTENSION.test(name)) {
        throw new Error('This file type is not on the safe text allowlist.');
    }
}

export function hasSensitiveKey(value: string): boolean {
    return SENSITIVE_KEY.test(value);
}

export function containsSecretLikeText(value: string): boolean {
    return SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function assertNoSecretLikeText(value: string): void {
    if (containsSecretLikeText(value)) {
        throw new Error('Content appears to contain credentials or secret material and cannot be written through MCP.');
    }
}

function collectSensitiveStringValues(value: unknown, output: Set<string>, sensitive = false): void {
    if (typeof value === 'string') {
        if (sensitive && value.length >= 8) output.add(value);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => collectSensitiveStringValues(item, output, sensitive));
        return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        collectSensitiveStringValues(child, output, sensitive || hasSensitiveKey(key));
    }
}

function redactKnownSecretValues(value: string, secrets: ReadonlySet<string>): string {
    let redacted = value;
    for (const secret of [...secrets].sort((left, right) => right.length - left.length)) {
        redacted = redacted.split(secret).join('[REDACTED]');
    }
    return redacted;
}

function redactJsonValue(value: unknown, secretValues: ReadonlySet<string>): unknown {
    if (typeof value === 'string') return redactKnownSecretValues(value, secretValues);
    if (Array.isArray(value)) return value.map((item) => redactJsonValue(item, secretValues));
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
        key,
        hasSensitiveKey(key) ? '[REDACTED]' : redactJsonValue(child, secretValues),
    ]));
}

export function redactText(content: string): { content: string; redacted: boolean; format: 'json' | 'text' } {
    try {
        const parsed = JSON.parse(content) as unknown;
        const secretValues = new Set<string>();
        collectSensitiveStringValues(parsed, secretValues);
        const redactedValue = redactJsonValue(parsed, secretValues);
        const redactedContent = JSON.stringify(redactedValue, null, 2);
        return {
            content: redactedContent,
            redacted: redactedContent !== JSON.stringify(parsed, null, 2),
            format: 'json',
        };
    } catch {
        const secretValues = new Set<string>();
        for (const match of content.matchAll(SENSITIVE_ASSIGNMENT_VALUE_PATTERN)) {
            const secretValue = match[2] ?? match[3];
            if (secretValue) secretValues.add(secretValue);
        }
        let redactedContent = content.replace(PRIVATE_KEY_BLOCK_PATTERN, '[REDACTED]');
        redactedContent = redactKnownSecretValues(redactedContent, secretValues);
        for (const pattern of SECRET_TEXT_PATTERNS) {
            redactedContent = redactedContent.replace(new RegExp(pattern.source, `${pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`}`), '[REDACTED]');
        }
        redactedContent = redactKnownSecretValues(redactedContent, secretValues);
        return { content: redactedContent, redacted: redactedContent !== content, format: 'text' };
    }
}

export function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

export function sha256(value: string): string {
    return `sha256:${sha256Hex(value)}`;
}

export function stateHash(value: unknown): string {
    return sha256(stableStringify(value));
}

export function truncateContent(content: string, maxChars = MAX_PLUGIN_OUTPUT_CHARS): { content: string; truncated: boolean } {
    if (content.length <= maxChars) return { content, truncated: false };
    return { content: content.slice(0, maxChars), truncated: true };
}

const SAFE_SETTING_KEYS: Record<string, ReadonlySet<string>> = Object.fromEntries(Object.entries({
    editor: [
        'backlinkContainChildren', 'backlinkExpandCount', 'backlinkSort', 'backmentionExpandCount', 'backmentionSort',
        'blockRefDynamicAnchorTextMaxLen', 'codeLigatures', 'codeLineWrap', 'codeSyntaxHighlightLineNum', 'codeTabSpaces',
        'databaseAttrViewMode', 'displayBookmarkIcon', 'displayNetImgMark', 'dynamicLoadBlocks', 'embedBlockBreadcrumb',
        'emoji', 'floatWindowDelay', 'floatWindowMode', 'fontFamily', 'fontFamilyDisplay', 'fontSize', 'fontSizeScrollZoom',
        'fontWeight', 'fullWidth', 'generateHistoryInterval', 'headingEmbedMode', 'historyRetentionDays', 'justify',
        'katexMacros', 'listItemDotNumberClickFocus', 'listLogicalOutdent', 'markdown', 'onlySearchForDoc',
        'pasteURLAutoConvert', 'rtl', 'spellcheck', 'spellcheckLanguages', 'virtualBlockRef', 'virtualBlockRefExclude',
        'virtualBlockRefInclude',
    ],
    export: [
        'addTitle', 'blockEmbedMode', 'blockRefMode', 'blockRefTextLeft', 'blockRefTextRight',
        'fileAnnotationRefMode', 'includeRelatedDocs', 'includeSubDocs', 'inlineMemo', 'markdownYFM',
        'paragraphBeginningSpace', 'pdfFooter', 'pdfWatermarkDesc', 'imageWatermarkDesc', 'removeAssetsID',
        'tagCloseMarker', 'tagOpenMarker',
    ],
    fileTree: [
        'allowCreateDeeper', 'alwaysSelectOpenedFile', 'boxDocEnabled', 'closeTabsOnStart', 'createDocAtTop',
        'docCreateSaveBox', 'docCreateSavePath', 'docIconClickExpand', 'largeFileWarningSize', 'maxListCount',
        'maxOpenTabCount', 'noSplitScreenWhenOpenTab', 'openFilesUseCurrentTab', 'parentDocClickExpand',
        'recentDocsMaxListCount', 'refCreateSaveBox', 'refCreateSavePath', 'shorthandSaveBox', 'shorthandSavePath',
        'sort', 'useSingleLineSave',
    ],
    search: [
        'alias', 'audioBlock', 'backlinkMentionAlias', 'backlinkMentionAnchor', 'backlinkMentionDoc',
        'backlinkMentionKeywordsLimit', 'backlinkMentionName', 'blockquote', 'callout', 'caseSensitive', 'codeBlock',
        'databaseBlock', 'document', 'embedBlock', 'hanSensitive', 'heading', 'htmlBlock', 'ial', 'iframeBlock',
        'indexAssetPath', 'limit', 'list', 'listItem', 'mathBlock', 'memo', 'name', 'paragraph', 'superBlock',
        'table', 'videoBlock', 'virtualRefAlias', 'virtualRefAnchor', 'virtualRefDoc', 'virtualRefName', 'widgetBlock',
    ],
    keymap: ['editor', 'general', 'plugin'],
    appearance: [
        'closeButtonBehavior', 'codeBlockThemeDark', 'codeBlockThemeLight', 'darkThemes', 'hideStatusBar',
        'hideToolbar', 'icon', 'iconVer', 'icons', 'lang', 'lightThemes', 'mode', 'modeOS', 'notifications',
        'statusBar', 'themeDark', 'themeJS', 'themeLight', 'themeVer',
    ],
    flashcard: [
        'deck', 'heading', 'list', 'mark', 'maximumInterval', 'newCardLimit', 'requestRetention',
        'reviewCardLimit', 'reviewMode', 'superBlock', 'weights',
    ],
    snippet: ['enabledCSS', 'enabledJS'],
}).map(([section, keys]) => [section, new Set(keys)]));

function assertSafeSettingValue(value: unknown, path: string[] = []): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSafeSettingValue(item, [...path, String(index)]));
        return;
    }
    if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (hasSensitiveKey(key)) {
                throw new Error(`Sensitive setting key is not allowed: ${[...path, key].join('.')}`);
            }
            assertSafeSettingValue(child, [...path, key]);
        }
        return;
    }
    if (typeof value === 'string') assertNoSecretLikeText(value);
}

export function assertSafeSettingPatch(section: string, value: unknown): void {
    const allowed = SAFE_SETTING_KEYS[section];
    if (!allowed) throw new Error(`Unsupported controlled setting section: ${section}`);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('A controlled setting patch must be an object.');
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
        if (!allowed.has(key)) {
            throw new Error(`Setting key is outside the controlled allowlist: ${section}.${key}`);
        }
    }
    assertSafeSettingValue(value);
}
