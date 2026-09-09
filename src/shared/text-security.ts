const SENSITIVE_KEY = /token|password|passwd|secret|api[_-]?key|apikey|cookie|authorization|auth[_-]?code|authcode|private[_-]?key|privatekey|access[_-]?key|accesskey|client[_-]?secret|clientsecret/i;
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
        collectSensitiveStringValues(child, output, sensitive || SENSITIVE_KEY.test(key));
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
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactJsonValue(child, secretValues),
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
            const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
            redactedContent = redactedContent.replace(new RegExp(pattern.source, flags), '[REDACTED]');
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
