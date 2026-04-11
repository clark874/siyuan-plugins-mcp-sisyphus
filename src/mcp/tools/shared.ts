import { ZodError, type ZodIssue } from 'zod';

import { getActionTier, getEnabledActions, isDangerousAction, type ActionTier, type CategoryToolConfig, type ToolCategory } from '../config';
import { getActionHint, TOOL_ACTION_HINTS, TOOL_GUIDANCE_BY_CATEGORY } from '../help';

export interface ToolResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

export type JsonSchema = Record<string, unknown>;

export interface ActionVariant<Action extends string> {
    action: Action;
    schema: JsonSchema;
}

export interface AggregatedToolOptions<Action extends string> {
    guidance?: string[];
    actionHints?: Partial<Record<Action, string>>;
    propertyDescriptionOverrides?: Record<string, string>;
}

interface ToolErrorContext {
    tool?: string;
    action?: string;
    rawArgs?: Record<string, unknown>;
    hint?: string;
}

interface ToolFieldError {
    path: string;
    message: string;
}

export function createActionSchema(
    action: string,
    properties: JsonSchema,
    required: string[],
    description?: string,
): JsonSchema {
    return {
        type: 'object',
        additionalProperties: false,
        description,
        properties: {
            action: {
                type: 'string',
                const: action,
                description: 'Action to perform',
            },
            ...properties,
        },
        required: ['action', ...required],
    };
}

export function getSchemaProperties(schema: JsonSchema): JsonSchema {
    const value = schema.properties;
    return value && typeof value === 'object' ? value as JsonSchema : {};
}

export function getSchemaRequired(schema: JsonSchema): string[] {
    return Array.isArray(schema.required)
        ? schema.required.filter((value): value is string => typeof value === 'string')
        : [];
}

function getSchemaDescription(schema: JsonSchema): string | null {
    return typeof schema.description === 'string' ? schema.description : null;
}

function formatFieldList(fields: string[]): string {
    return fields.length > 0 ? fields.join(', ') : 'no additional fields';
}

function buildActionUsageSummary<Action extends string>(variants: ActionVariant<Action>[]): string {
    const actionShapes = new Map<string, string[]>();

    for (const variant of variants) {
        const fields = getSchemaRequired(variant.schema).filter((field) => field !== 'action');
        const shape = formatFieldList(fields);
        const shapes = actionShapes.get(variant.action) ?? [];
        if (!shapes.includes(shape)) {
            shapes.push(shape);
        }
        actionShapes.set(variant.action, shapes);
    }

    return [...actionShapes.entries()]
        .map(([action, shapes]) => `${action}: ${shapes.join(' | ')}`)
        .join('; ');
}

function mergePropertySchemas<Action extends string>(
    variants: ActionVariant<Action>[],
    propertyDescriptionOverrides: Record<string, string> = {},
): JsonSchema {
    const mergedProperties: JsonSchema = {};
    const descriptions = new Map<string, Set<string>>();
    const enums = new Map<string, Set<unknown>>();

    for (const variant of variants) {
        for (const [propertyName, propertySchema] of Object.entries(getSchemaProperties(variant.schema))) {
            if (propertyName === 'action' || !propertySchema || typeof propertySchema !== 'object') continue;

            mergedProperties[propertyName] = {
                ...(mergedProperties[propertyName] as JsonSchema | undefined),
                ...(propertySchema as JsonSchema),
            };

            const description = getSchemaDescription(propertySchema as JsonSchema);
            if (description) {
                const values = descriptions.get(propertyName) ?? new Set<string>();
                values.add(description);
                descriptions.set(propertyName, values);
            }

            const enumValues = (propertySchema as JsonSchema).enum;
            if (Array.isArray(enumValues)) {
                const values = enums.get(propertyName) ?? new Set<unknown>();
                for (const value of enumValues) {
                    values.add(value);
                }
                enums.set(propertyName, values);
            }
        }
    }

    for (const [propertyName, propertySchema] of Object.entries(mergedProperties)) {
        const overrideDescription = propertyDescriptionOverrides[propertyName];
        if (overrideDescription) {
            (propertySchema as JsonSchema).description = overrideDescription;
        } else {
            const propertyDescriptions = descriptions.get(propertyName);
            if (propertyDescriptions && propertyDescriptions.size > 0) {
                (propertySchema as JsonSchema).description = [...propertyDescriptions].join(' / ');
            }
        }

        const enumValues = enums.get(propertyName);
        if (enumValues && enumValues.size > 0) {
            (propertySchema as JsonSchema).enum = [...enumValues];
        }
    }

    return mergedProperties;
}

function buildEssentialGuidance<Action extends string>(
    category: ToolCategory,
    actionList: Action[],
    options: AggregatedToolOptions<Action>,
): string[] {
    const notes: string[] = [];

    // Only include top 2 guidance lines (most critical context)
    const guidance = options.guidance ?? [];
    notes.push(...guidance.slice(0, 2));

    const confirmationActions = actionList.filter((action) => isDangerousAction(category, action));
    if (confirmationActions.length > 0) {
        notes.push(`Requires user confirmation before: ${confirmationActions.join(', ')}.`);
    }

    // Action hints are no longer inlined — available via siyuan://help/action/{tool}/{action}

    return notes;
}

function formatIssuePath(path: PropertyKey[]): string {
    return path
        .map((segment) => typeof segment === 'number' ? `[${segment}]` : String(segment))
        .join('.')
        .replace(/\.\[/g, '[');
}

function getValueAtPath(value: unknown, path: PropertyKey[]): unknown {
    let current = value;
    for (const segment of path) {
        if (current === null || current === undefined) return undefined;
        if (typeof segment === 'number') {
            if (!Array.isArray(current)) return undefined;
            current = current[segment];
            continue;
        }
        if (typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[String(segment)];
    }
    return current;
}

function formatIssueMessage(issue: ZodIssue, rawArgs?: Record<string, unknown>): string {
    const path = formatIssuePath(issue.path);
    const valueAtPath = path ? getValueAtPath(rawArgs, issue.path) : undefined;

    if (issue.code === 'invalid_type') {
        if (valueAtPath === undefined && path) {
            return `${path} is required.`;
        }
        return path ? `${path} has an invalid type.` : 'Invalid input type.';
    }

    if (issue.code === 'unrecognized_keys' && 'keys' in issue && Array.isArray(issue.keys)) {
        return `Unexpected field(s): ${issue.keys.join(', ')}.`;
    }

    if (issue.message && issue.message !== 'Invalid input') {
        return issue.message;
    }

    return path ? `Invalid value for ${path}.` : 'Invalid input.';
}

function formatZodIssues(error: ZodError, rawArgs?: Record<string, unknown>): ToolFieldError[] {
    return error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: formatIssueMessage(issue, rawArgs),
    }));
}

function getValidationMessage(tool?: string, action?: string): string {
    if (tool && action) return `Invalid arguments for ${tool}(action="${action}").`;
    if (tool) return `Invalid arguments for tool "${tool}".`;
    return 'Invalid arguments.';
}

function resolveHint(context?: ToolErrorContext): string | undefined {
    return context?.hint ?? getActionHint(context?.tool, context?.action);
}

function toErrorText(payload: Record<string, unknown>, isError = true): ToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        isError,
    };
}

function isApiError(error: Error): boolean {
    return error.name === 'SiYuanError'
        || error.message.startsWith('SiYuan API error:')
        || error.message.startsWith('HTTP error:')
        || error.message.startsWith('Request timeout');
}

function includeDebugDetails(): boolean {
    return process.env.SIYUAN_MCP_DEBUG_ERRORS === '1';
}

function buildTieredDescription<Action extends string>(
    category: ToolCategory,
    description: string,
    enabledActions: Action[],
    enabledVariants: ActionVariant<Action>[],
    options: AggregatedToolOptions<Action>,
): string {
    const basicActions = enabledActions.filter((a) => getActionTier(category, a) === 'basic');
    const advancedActions = enabledActions.filter((a) => getActionTier(category, a) === 'advanced');

    const basicVariants = enabledVariants.filter((v) => basicActions.includes(v.action));
    const basicUsageSummary = buildActionUsageSummary(basicVariants);

    const parts = [
        `${description} Use the "action" field to select the operation.`,
    ];

    if (basicActions.length > 0) {
        parts.push(`Common actions: ${basicActions.join(', ')}. Required fields: ${basicUsageSummary}.`);
    }

    if (advancedActions.length > 0) {
        parts.push(`Additional actions: ${advancedActions.join(', ')}. Read siyuan://help/action/${category}/{action} for details, or call action="help" if resources are unavailable.`);
    }

    const guidance = buildEssentialGuidance(category, enabledActions, options);
    if (guidance.length > 0) {
        parts.push(guidance.join(' '));
    }

    return parts.join('\n\n');
}

export function buildAggregatedTool<Action extends string>(
    category: ToolCategory,
    description: string,
    config: CategoryToolConfig<Action>,
    variants: ActionVariant<Action>[],
    options: AggregatedToolOptions<Action> = {},
) {
    if (!config.enabled) return [];

    const enabledActions = getEnabledActions(config) as Action[];
    const enabledActionSet = new Set(enabledActions);
    const enabledVariants = variants.filter((variant) => enabledActionSet.has(variant.action));
    if (enabledVariants.length === 0) return [];

    const fullDescription = buildTieredDescription(category, description, enabledActions, enabledVariants, options);
    const confirmationActions = enabledActions.filter((action) => isDangerousAction(category, action));

    return [{
        name: category,
        description: fullDescription,
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                action: {
                    type: 'string',
                    enum: [...enabledActions, 'help'],
                    description: `Action to perform. Supported values: ${enabledActions.join(', ')}. Use action="help" for usage guidance.${confirmationActions.length > 0 ? ` User confirmation is required before calling: ${confirmationActions.join(', ')}.` : ''}`,
                },
                ...mergePropertySchemas(enabledVariants, options.propertyDescriptionOverrides),
            },
            required: ['action'],
        },
    }];
}

export function tryHandleHelpAction<Action extends string>(
    category: ToolCategory,
    rawArgs: Record<string, unknown>,
    config: CategoryToolConfig<Action>,
    variants: ActionVariant<Action>[],
): ToolResult | null {
    if (rawArgs.action !== 'help') return null;

    const enabledActions = getEnabledActions(config) as Action[];
    const enabledSet = new Set(enabledActions);
    const enabledVariants = variants.filter((v) => enabledSet.has(v.action));

    const tierGroups: Record<ActionTier, string[]> = { basic: [], advanced: [] };
    for (const action of enabledActions) {
        tierGroups[getActionTier(category, action)].push(action);
    }

    const actionDetails: Record<string, { requiredFields: string; hint?: string; example?: Record<string, unknown> }> = {};
    const seen = new Set<string>();
    for (const variant of enabledVariants) {
        if (seen.has(variant.action)) continue;
        seen.add(variant.action);
        const fields = getSchemaRequired(variant.schema).filter((f) => f !== 'action');
        const example: Record<string, unknown> = { action: variant.action };
        const properties = getSchemaProperties(variant.schema);
        for (const field of fields) {
            const prop = properties[field];
            example[field] = prop && typeof prop === 'object' && 'type' in (prop as JsonSchema)
                ? `<${field}>`
                : `<${field}>`;
        }
        actionDetails[variant.action] = {
            requiredFields: fields.length > 0 ? fields.join(', ') : 'none',
            hint: TOOL_ACTION_HINTS[category]?.[variant.action],
            ...(fields.length > 0 ? { example } : {}),
        };
    }

    const guidance = TOOL_GUIDANCE_BY_CATEGORY[category] ?? [];

    return createJsonResult({
        tool: category,
        commonActions: tierGroups.basic,
        advancedActions: tierGroups.advanced,
        actions: actionDetails,
        guidance,
        helpResources: [
            `siyuan://help/action/${category}/{action}`,
            'siyuan://help/tool-overview',
            'siyuan://help/examples',
            'siyuan://help/ai-layout-guide',
        ],
    });
}

export interface TruncationMeta {
    truncated: boolean;
    showing: number;
    total: number;
    hint: string;
}

export function applyTruncation<T>(
    items: T[],
    limit: number,
    hint: string,
): { items: T[]; meta?: TruncationMeta } {
    if (items.length <= limit) return { items };
    return {
        items: items.slice(0, limit),
        meta: {
            truncated: true,
            showing: limit,
            total: items.length,
            hint,
        },
    };
}

export interface PaginationResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
    showing: number;
    truncated: boolean;
    hasNextPage: boolean;
}

export function paginate<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, pageCount);
    const start = (normalizedPage - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);
    return {
        items: paged,
        total,
        page: normalizedPage,
        pageSize,
        pageCount,
        showing: paged.length,
        truncated: pageCount > 1,
        hasNextPage: normalizedPage < pageCount,
    };
}

export function createJsonResult(value: unknown): ToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    };
}

export function createSetIconReminder(
    target: 'document' | 'notebook',
    alreadySet = false,
): string {
    if (target === 'notebook') {
        return alreadySet
            ? 'Use notebook(action="set_icon") later if you want to change the notebook icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.'
            : 'After creation, call notebook(action="set_icon") to set the notebook icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.';
    }

    return alreadySet
        ? 'Use document(action="set_icon") later if you want to change the document icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.'
        : 'After creation, call document(action="set_icon") to set the document icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.';
}

export function createWriteSuccessResult(
    context: Record<string, unknown>,
    rawResult?: unknown,
): ToolResult {
    if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
        return createJsonResult({ success: true, ...(rawResult as Record<string, unknown>), ...context });
    }

    return createJsonResult({ success: true, ...context });
}

export function createErrorResult(error: unknown, context?: ToolErrorContext): ToolResult {
    if (error instanceof ZodError) {
        const fields = formatZodIssues(error, context?.rawArgs);
        const payload: Record<string, unknown> = {
            error: {
                type: 'validation_error',
                message: getValidationMessage(context?.tool, context?.action),
                ...(context?.tool ? { tool: context.tool } : {}),
                ...(context?.action ? { action: context.action } : {}),
                ...(fields.length > 0 ? { fields } : {}),
                ...(resolveHint(context) ? { hint: resolveHint(context) } : {}),
            },
        };
        return toErrorText(payload);
    }

    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const payload: Record<string, unknown> = {
        error: {
            type: isApiError(normalizedError) ? 'api_error' : 'internal_error',
            message: normalizedError.message,
            ...(context?.tool ? { tool: context.tool } : {}),
            ...(context?.action ? { action: context.action } : {}),
            ...(resolveHint(context) ? { hint: resolveHint(context) } : {}),
            ...(includeDebugDetails() && normalizedError.stack ? { details: normalizedError.stack } : {}),
        },
    };

    return toErrorText(payload);
}

export function createPermissionDeniedResult(notebookId: string, currentPerm: string, required: 'read' | 'write' | 'delete'): ToolResult {
    return toErrorText({
        error: {
            type: 'permission_denied',
            message: `Notebook "${notebookId}" has permission "${currentPerm}", ${required} access is required. Use notebook(action="set_permission") to change.`,
            notebook: notebookId,
            current_permission: currentPerm,
            required_permission: required,
        },
    });
}

export function createDisabledActionResult(name: ToolCategory, action: string): ToolResult {
    return toErrorText({
        error: {
            type: 'action_disabled',
            message: `Action "${action}" is disabled for tool "${name}".`,
            tool: name,
            action,
            hint: 'Enable the action in Settings -> Plugins -> SiYuan MCP sisyphus, or call listTools() again to inspect the currently enabled actions.',
        },
    });
}
