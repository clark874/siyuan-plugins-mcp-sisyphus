function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHelpIndexPayload(value: unknown): value is Record<string, unknown> {
    if (!isObject(value)) return false;

    return typeof value.tool === 'string'
        && (Array.isArray(value.commonActions) || Array.isArray(value.advancedActions))
        && value.action === undefined;
}

export function isActionHelpPayload(value: unknown): value is Record<string, unknown> {
    if (!isObject(value)) return false;

    return typeof value.tool === 'string'
        && typeof value.action === 'string'
        && (value.example !== undefined || Array.isArray(value.examples) || Array.isArray(value.shapes));
}
