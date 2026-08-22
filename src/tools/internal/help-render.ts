import { listActionArrayContracts, type ActionArrayContract } from '../../core/action-array-contracts';
import { getActionTier, isDangerousAction, type ActionTier, type ToolCategory } from '../../core/config';
import { TOOL_ACTION_EXAMPLES, TOOL_ACTION_HINTS, TOOL_GUIDANCE_BY_CATEGORY, type HelpExample } from '../../core/help';
import { PRECONDITION_FIELD, getActionSafetyPolicy } from '../../core/write-safety-policy';
import { PRIMARY_CLI_COMMAND } from '../../shared/constants';
import { getSchemaProperties, getSchemaRequired } from './schema-analyzer';
import type { ActionVariant, JsonSchema } from './types';

function getSchemaRequiredWithoutAction(schema: JsonSchema): string[] {
    return getSchemaRequired(schema).filter(field => field !== 'action');
}

function getSchemaFieldNames(schema: JsonSchema, required?: boolean): string[] {
    const requiredFields = new Set(getSchemaRequiredWithoutAction(schema));

    return Object.entries(getSchemaProperties(schema)).flatMap(([name, propertySchema]) => {
        if (name === 'action' || !propertySchema || typeof propertySchema !== 'object' || Array.isArray(propertySchema)) {
            return [];
        }

        if (required === true && !requiredFields.has(name)) return [];
        if (required === false && requiredFields.has(name)) return [];
        return [name];
    });
}

export function buildExampleValue(fieldName: string, schema: JsonSchema): unknown {
    const description = typeof schema.description === 'string' ? schema.description : '';
    const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
    if (enumValues.length > 0) return enumValues[0];

    switch (fieldName) {
        case 'notebook':
            return '20210808180117-czj9bvb';
        case 'deckID':
            return '20230218211946-2kw8jgx';
        case 'cardID':
            return '20240318112233-card01';
        case 'rootID':
            return '20240318112233-root01';
        case 'id':
        case 'parentID':
        case 'previousID':
        case 'nextID':
        case 'fromID':
        case 'toID':
            return '20240318112233-abc123';
        case 'fromIDs':
        case 'blockIDs':
            return ['20240318112233-a', '20240318112233-b'];
        case 'primaryKeyTexts':
            return ['First row', 'Second row'];
        case 'edit':
            return { old: 'ORIGINAL_TEXT', new: 'NEW_TEXT' };
        case 'cells':
            return [{
                rowID: '20240318112233-row001',
                columnID: '20240318112233-col001',
                valueType: 'text',
                text: 'Updated value',
            }];
        case 'fromPaths':
            return ['/20240318112233-a.sy', '/20240318112233-b.sy'];
        case 'toNotebook':
            return '20210808180117-czj9bvb';
        case 'toPath':
            return '/20240318112233-existing-parent.sy';
        case 'path':
            return description.includes('Human-readable')
                ? '/Inbox/Weekly Note'
                : '/20240318112233-abc123.sy';
        case 'paths':
            return ['/assets/example.png'];
        case 'title':
            return 'Weekly Notes';
        case 'name':
            return description.includes('Export file name') ? 'assets-export.zip' : 'Research';
        case 'markdown':
            return '- Seed item';
        case 'dataType':
            return 'markdown';
        case 'data':
            return '- New item';
        case 'template':
            return 'codex-{{ now | date "2006" }}';
        case 'msg':
            return 'Hello from MCP';
        case 'timeout':
            return 3000;
        case 'rating':
            return 3;
        case 'reviewedCards':
            return [{ cardID: '20240318112233-card01', rating: 3 }];
        case 'assetsDirPath':
            return '/assets/';
        case 'file':
            return 'SGVsbG8sIFNpWXVhbg==';
        case 'fileName':
            return 'hello.txt';
        case 'attrs':
            return { 'custom-mcp': 'demo' };
        case 'conf':
            return { closed: false };
        case 'permission':
            return 'none';
        case 'query':
            return 'search keyword';
        case 'stmt':
            return "SELECT * FROM blocks WHERE content LIKE '%keyword%' LIMIT 20";
        case 'k':
            return 'todo';
        case 'keyword':
            return 'filter text';
        default:
            break;
    }

    if (schema.type === 'array') {
        const items = schema.items && typeof schema.items === 'object' ? schema.items as JsonSchema : { type: 'string' };
        return [buildExampleValue(`${fieldName}Item`, items)];
    }

    if (schema.type === 'object') {
        const properties = getSchemaProperties(schema);
        const firstProperty = Object.keys(properties)[0];
        if (!firstProperty) return {};
        return {
            [firstProperty]: buildExampleValue(firstProperty, properties[firstProperty] as JsonSchema),
        };
    }

    if (schema.type === 'number') return 1;
    if (schema.type === 'boolean') return false;
    return `<${fieldName}>`;
}

export function buildActionExampleObjects<Action extends string>(
    variants: ActionVariant<Action>[],
    action: string,
): Record<string, unknown>[] {
    const matching = variants.filter((variant) => variant.action === action);

    return matching.map((variant) => {
        const properties = getSchemaProperties(variant.schema);
        const example: Record<string, unknown> = { action };

        for (const field of getSchemaRequiredWithoutAction(variant.schema)) {
            example[field] = buildExampleValue(field, (properties[field] ?? {}) as JsonSchema);
        }

        return example;
    });
}

export function getCuratedActionExamples(category: ToolCategory, action: string): HelpExample[] {
    return TOOL_ACTION_EXAMPLES[category]?.[action] ?? [];
}

export function buildActionShapes<Action extends string>(
    variants: ActionVariant<Action>[],
    action: string,
): string[] {
    return variants
        .filter((variant) => variant.action === action)
        .map((variant) => {
            const fields = getSchemaRequiredWithoutAction(variant.schema);
            return fields.length > 0 ? fields.join(' + ') : 'action only';
        });
}

function formatFieldList(fields: string[]): string {
    return fields.length > 0 ? fields.join(', ') : 'no additional fields';
}

export function buildActionUsageSummary<Action extends string>(variants: ActionVariant<Action>[]): string {
    const actionShapes = new Map<string, string[]>();

    for (const variant of variants) {
        const shape = formatFieldList(
            getSchemaFieldNames(variant.schema, true),
        );
        const shapes = actionShapes.get(variant.action) ?? [];
        if (!shapes.includes(shape)) shapes.push(shape);
        actionShapes.set(variant.action, shapes);
    }

    return [...actionShapes.entries()].map(([action, shapes]) => `${action}: ${shapes.join(' | ')}`).join('; ');
}

export function buildParameterContract<Action extends string>(
    category: ToolCategory,
    variants: ActionVariant<Action>[],
): string {
    const seen = new Set<string>();
    return variants.flatMap((variant) => {
        if (seen.has(variant.action)) return [];
        seen.add(variant.action);

        const required = getSchemaFieldNames(variant.schema, true);
        const optional = getSchemaFieldNames(variant.schema, false);

        return [`${category}.${variant.action}: required ${required.length > 0 ? `[${required.join(', ')}]` : '[]'} | optional ${optional.length > 0 ? `[${optional.join(', ')}]` : '[]'}`];
    }).join('\n');
}

export function buildHelpIndex<Action extends string>(
    category: ToolCategory,
    enabledActions: Action[],
    enabledVariants: ActionVariant<Action>[],
): Record<string, unknown> {
    const tierGroups: Record<ActionTier, string[]> = { basic: [], advanced: [] };
    for (const action of enabledActions) tierGroups[getActionTier(category, action)].push(action);

    const actionSummaries: Record<string, string> = {};
    const actions: Record<string, { hint?: string; requiresConfirmation: boolean }> = {};
    const seen = new Set<string>();
    for (const variant of enabledVariants) {
        if (seen.has(variant.action)) continue;
        seen.add(variant.action);
        const hint = TOOL_ACTION_HINTS[category]?.[variant.action];
        const fields = getSchemaFieldNames(variant.schema, true);
        actionSummaries[variant.action] = hint ?? (fields.length > 0 ? `requires: ${fields.join(', ')}` : 'no extra fields');
        actions[variant.action] = {
            ...(hint ? { hint } : {}),
            requiresConfirmation: isDangerousAction(category, variant.action),
        };
    }

    const confirmationActions = enabledActions.filter((action) => isDangerousAction(category, action));
    return {
        tool: category,
        commonActions: tierGroups.basic,
        advancedActions: tierGroups.advanced,
        guidance: TOOL_GUIDANCE_BY_CATEGORY[category] ?? [],
        actions,
        actionSummaries,
        ...(confirmationActions.length > 0 ? { requiresConfirmation: confirmationActions } : {}),
        detailsHint: `Call ${category}(action="help", topic="<actionName>") for required fields, shapes, and a minimal example.`,
        helpResources: [
            `siyuan://help/action/${category}/{action}`,
            'siyuan://help/tool-overview',
            'siyuan://help/examples',
            'siyuan://help/ai-layout-guide',
        ],
    };
}

interface StrictWriteHelp {
    mode: 'mutation';
    protocol: 'guarded' | 'request-id-only';
    precondition: string;
    preconditionField: string | null;
    preconditionFlag: string | null;
    requestId: 'fresh UUIDv7';
    requestIdFlag: '--request-id';
    validateOnly: boolean;
    validateOnlyFlag: '--validate-only';
    validateOnlySteps: string[];
}

function buildStrictWriteHelp(category: ToolCategory, action: string): StrictWriteHelp | null {
    const policy = getActionSafetyPolicy(category, action);
    if (policy.mode !== 'mutation') return null;

    const preconditionField = policy.precondition === 'none' ? null : PRECONDITION_FIELD[policy.precondition];
    const protocol = preconditionField ? 'guarded' : 'request-id-only';
    const validateOnlySteps = preconditionField
        ? [
            'Call the action with validateOnly=true and the complete business arguments; nothing is written.',
            `Copy the returned ${preconditionField} credential without changing any business argument.`,
            `Execute once with ${preconditionField} and a fresh UUIDv7 requestId, then read the target back.`,
        ]
        : [
            'validateOnly=true is an optional schema/protocol check; it writes nothing and returns no credential.',
            'Execute the mutation once with a fresh UUIDv7 requestId, then read the target back.',
        ];

    return {
        mode: 'mutation',
        protocol,
        precondition: policy.precondition,
        preconditionField,
        preconditionFlag: preconditionField ? `--${toKebab(preconditionField)}` : null,
        requestId: 'fresh UUIDv7',
        requestIdFlag: '--request-id',
        validateOnly: policy.validateOnly,
        validateOnlyFlag: '--validate-only',
        validateOnlySteps,
    };
}

function buildCanonicalCliExamples(
    category: ToolCategory,
    action: string,
    example: Record<string, unknown>,
    safety: StrictWriteHelp | null,
): string[] {
    const base = buildCanonicalCliCommand(category, action, example);
    const examples = safety?.protocol === 'guarded'
        ? [
            `${base} --validate-only`,
            `${base} ${safety.preconditionFlag} <preflight-credential> --request-id <uuidv7>`,
        ]
        : safety?.protocol === 'request-id-only'
            ? [`${base} --request-id <uuidv7>`]
            : [base];

    if (category === 'av' && action === 'add_rows') {
        examples.push(
            `${PRIMARY_CLI_COMMAND} av set-cells --av-id 20240318112233-abc123 --cells-json '[{"rowID":"<rowID-from-add-rows>","columnID":"<columnID>","valueType":"text","text":"Updated value"}]' --validate-only`,
        );
    }
    return examples;
}

function buildCanonicalCliCommand(category: ToolCategory, action: string, example: Record<string, unknown>): string {
    const parts = [PRIMARY_CLI_COMMAND, category, toKebab(action)];
    for (const [field, value] of Object.entries(example)) {
        if (field === 'action' || value === undefined) continue;
        const flag = `--${toKebab(field)}`;
        if (Array.isArray(value)) {
            if (value.every((item) => isScalar(item))) {
                for (const item of value) parts.push(flag, quoteCliValue(item));
            } else {
                parts.push(`${flag}-json`, quoteJson(value));
            }
        } else if (value && typeof value === 'object') {
            parts.push(`${flag}-json`, quoteJson(value));
        } else if (typeof value === 'boolean') {
            parts.push(value ? flag : `--no-${toKebab(field)}`);
        } else {
            parts.push(flag, quoteCliValue(value));
        }
    }
    return parts.join(' ');
}

function buildCliFlags(schema: JsonSchema, fields: string[]): string[] {
    const properties = getSchemaProperties(schema);
    return fields.map((field) => {
        const fieldSchema = properties[field] as JsonSchema | undefined;
        return `--${toKebab(field)}${requiresJsonSidecar(fieldSchema) ? '-json' : ''}`;
    });
}

function requiresJsonSidecar(schema: JsonSchema | undefined): boolean {
    if (!schema) return false;
    if (schema.type === 'object') return true;
    if (schema.type === 'array') {
        return Boolean(schema.items && typeof schema.items === 'object' && (schema.items as JsonSchema).type === 'object');
    }
    return ['oneOf', 'anyOf'].some((keyword) =>
        Array.isArray(schema[keyword]) && schema[keyword].some((branch: unknown) =>
            branch && typeof branch === 'object' && requiresJsonSidecar(branch as JsonSchema),
        ),
    );
}

function collectArrayContracts(
    category: ToolCategory,
    action: string,
    variants: ActionVariant<string>[],
): Array<ActionArrayContract & { flag: string }> {
    const byField = new Map<string, ActionArrayContract>();
    for (const variant of variants) {
        for (const contract of listActionArrayContracts(category, action, getSchemaProperties(variant.schema))) {
            const previous = byField.get(contract.field);
            byField.set(contract.field, {
                ...previous,
                ...contract,
                minItems: Math.max(previous?.minItems ?? 0, contract.minItems ?? 0) || undefined,
                uniqueItems: previous?.uniqueItems === true || contract.uniqueItems === true || undefined,
            });
        }
    }
    return [...byField.values()].map((contract) => ({
        ...contract,
        flag: `--${toKebab(contract.field)}`,
    }));
}

function isScalar(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function quoteCliValue(value: unknown): string {
    const text = String(value);
    if (/^<[A-Za-z0-9_-]+>$/.test(text) || /^[A-Za-z0-9._:/-]+$/.test(text)) return text;
    return `'${text.replace(/'/g, `'"'"'`)}'`;
}

function quoteJson(value: unknown): string {
    return `'${JSON.stringify(value).replace(/'/g, `'"'"'`)}'`;
}

function toKebab(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
}

export function buildActionHelp<Action extends string>(
    category: ToolCategory,
    action: Action,
    enabledVariants: ActionVariant<Action>[],
): Record<string, unknown> {
    const matching = enabledVariants.filter((variant) => variant.action === action);
    const requiredFieldSets = matching.map((variant) => getSchemaFieldNames(variant.schema, true));
    const optionalFieldSets = matching.map((variant) => getSchemaFieldNames(variant.schema, false));
    const generatedExamples = buildActionExampleObjects(matching, action);
    if (category === 'av' && action === 'add_rows') {
        for (const generated of generatedExamples) {
            generated.avID = '20240318112233-abc123';
            generated.blockIDs ??= buildExampleValue('blockIDs', { type: 'array', items: { type: 'string' } });
        }
    }
    const example = generatedExamples.length === 1 ? generatedExamples[0] : generatedExamples;
    const primaryExample = generatedExamples[0] ?? { action };
    const safety = buildStrictWriteHelp(category, action);
    const cliExamples = buildCanonicalCliExamples(category, action, primaryExample, safety);
    const canonicalCliExample: HelpExample = {
        title: 'Canonical CLI',
        description: cliExamples.join('\n'),
        mcp: primaryExample,
    };
    const curatedExamples = getCuratedActionExamples(category, action);
    const examples = safety ? [...curatedExamples, canonicalCliExample] : curatedExamples;
    const primarySchema = matching[0]?.schema ?? {};
    const arrayContracts = collectArrayContracts(category, action, matching);
    const safetyGuidance = safety
        ? [`Strict-write protocol (${safety.protocol}): ${safety.validateOnlySteps.join(' ')}`]
        : [];
    const followUpGuidance = category === 'av' && action === 'add_rows'
        ? [`After add_rows returns rowID values, use: ${cliExamples[cliExamples.length - 1]}`]
        : [];

    return {
        tool: category,
        action,
        ...(TOOL_ACTION_HINTS[category]?.[action] ? { hint: TOOL_ACTION_HINTS[category][action] } : {}),
        shapes: requiredFieldSets.map((fields) => fields.length > 0 ? fields.join(' + ') : 'action only'),
        requiredFields: requiredFieldSets.length === 1 ? requiredFieldSets[0] : requiredFieldSets,
        example,
        ...(examples.length > 0 ? { examples } : {}),
        ...(safety ? {
            cliFlags: {
                required: buildCliFlags(primarySchema, requiredFieldSets[0] ?? []),
                optional: buildCliFlags(primarySchema, optionalFieldSets[0] ?? []),
                protocol: [safety.validateOnlyFlag, safety.requestIdFlag, ...(safety.preconditionFlag ? [safety.preconditionFlag] : [])],
            },
            cliExamples,
            writeSafety: safety,
        } : {}),
        ...(arrayContracts.length > 0 ? { arrayContracts } : {}),
        guidance: [
            ...(TOOL_GUIDANCE_BY_CATEGORY[category] ?? []),
            ...safetyGuidance,
            ...followUpGuidance,
        ],
        requiresConfirmation: isDangerousAction(category, action),
        fullDocResource: `siyuan://help/action/${category}/${action}`,
    };
}

// Re-export alias for backward compatibility with resources.ts style callers.
export function buildActionExamplesMarkdown<Action extends string>(
    variants: ActionVariant<Action>[],
    action: string,
    category?: ToolCategory,
): string[] {
    if (category) {
        const curated = getCuratedActionExamples(category, action);
        if (curated.length > 0) {
            return curated.map((example) => [
                `### ${example.title}`,
                '',
                ...(example.description ? [example.description, ''] : []),
                `\`\`\`json\n${JSON.stringify(example.mcp, null, 2)}\n\`\`\``,
            ].join('\n'));
        }
    }

    return buildActionExampleObjects(variants, action).map((example) =>
        `\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``,
    );
}

export function buildShapeSummaryMarkdown<Action extends string>(
    variants: ActionVariant<Action>[],
    action: string,
): string[] {
    return variants
        .filter((variant) => variant.action === action)
        .map((variant) => {
            const fields = getSchemaRequiredWithoutAction(variant.schema);
            return fields.length > 0 ? `- \`${fields.join(' + ')}\`` : '- `action` only';
        });
}

export type { ToolCategory };
