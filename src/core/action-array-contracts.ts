import type { ToolCategory } from './config';

export type JsonSchemaLike = Record<string, any>;

export interface ActionArrayContract {
    field: string;
    minItems?: number;
    uniqueItems?: boolean;
    uniqueBy?: string[];
}

const ACTION_ARRAY_OVERRIDES: Partial<Record<ToolCategory, Record<string, Record<string, Omit<ActionArrayContract, 'field'>>>>> = {
    av: {
        add_rows: {
            blockIDs: { minItems: 1, uniqueItems: true },
            primaryKeyTexts: { minItems: 1, uniqueItems: true },
        },
        remove_rows: {
            srcIDs: { minItems: 1, uniqueItems: true },
        },
        set_cells: {
            cells: { minItems: 1, uniqueBy: ['rowID', 'columnID'] },
            items: { minItems: 1, uniqueBy: ['rowID', 'columnID'] },
        },
    },
    block: {
        move: {
            ids: { minItems: 1, uniqueItems: true },
        },
        update: {
            items: { minItems: 1, uniqueBy: ['id'] },
        },
    },
};

export function schemaAcceptsArray(schema: JsonSchemaLike | undefined): boolean {
    return Boolean(findArraySchema(schema));
}

export function getActionArrayContract(
    category: ToolCategory | undefined,
    action: string | undefined,
    field: string,
    schema?: JsonSchemaLike,
): ActionArrayContract | null {
    const arraySchema = findArraySchema(schema);
    const override = category && action
        ? ACTION_ARRAY_OVERRIDES[category]?.[action]?.[field]
        : undefined;
    if (!arraySchema && !override) return null;

    const minItems = typeof arraySchema?.minItems === 'number' ? arraySchema.minItems : override?.minItems;
    const uniqueItems = arraySchema?.uniqueItems === true || override?.uniqueItems === true;
    const uniqueBy = override?.uniqueBy;
    return {
        field,
        ...(minItems !== undefined ? { minItems } : {}),
        ...(uniqueItems ? { uniqueItems: true } : {}),
        ...(uniqueBy ? { uniqueBy } : {}),
    };
}

export function listActionArrayContracts(
    category: ToolCategory,
    action: string,
    properties: Record<string, JsonSchemaLike>,
): ActionArrayContract[] {
    const fields = new Set([
        ...Object.keys(properties),
        ...Object.keys(ACTION_ARRAY_OVERRIDES[category]?.[action] ?? {}),
    ]);

    return [...fields].flatMap((field) => {
        const contract = getActionArrayContract(category, action, field, properties[field]);
        if (!contract || (contract.minItems === undefined && !contract.uniqueItems && !contract.uniqueBy)) return [];
        return [contract];
    });
}

export function validateActionArrayValue(
    value: unknown,
    contract: ActionArrayContract,
    flag: string,
): void {
    if (!Array.isArray(value)) return;
    if (contract.minItems !== undefined && value.length < contract.minItems) {
        const count = contract.minItems === 1 ? 'one' : String(contract.minItems);
        const noun = contract.minItems === 1 ? 'item' : 'items';
        throw new Error(`${flag} must contain at least ${count} ${noun}.`);
    }

    const duplicate = contract.uniqueItems
        ? findDuplicate(value, (item) => stableIdentity(item))
        : contract.uniqueBy
            ? findDuplicate(value, (item) => objectIdentity(item, contract.uniqueBy!))
            : undefined;
    if (duplicate === undefined) return;

    const label = /ids$/i.test(contract.field) ? 'IDs' : 'items';
    throw new Error(`${flag} must not contain duplicate ${label}: ${duplicate}.`);
}

function findArraySchema(schema: JsonSchemaLike | undefined): JsonSchemaLike | undefined {
    if (!schema) return undefined;
    if (schema.type === 'array') return schema;
    for (const keyword of ['anyOf', 'oneOf'] as const) {
        if (!Array.isArray(schema[keyword])) continue;
        for (const branch of schema[keyword]) {
            const found = branch && typeof branch === 'object' ? findArraySchema(branch) : undefined;
            if (found) return found;
        }
    }
    return undefined;
}

function findDuplicate(values: unknown[], identity: (value: unknown) => string | undefined): string | undefined {
    const seen = new Set<string>();
    for (const value of values) {
        const key = identity(value);
        if (key === undefined) continue;
        if (seen.has(key)) return key;
        seen.add(key);
    }
    return undefined;
}

function stableIdentity(value: unknown): string | undefined {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
}

function objectIdentity(value: unknown, fields: string[]): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const object = value as Record<string, unknown>;
    const parts = fields.map((field) => object[field]);
    if (parts.some((part) => typeof part !== 'string' && typeof part !== 'number')) return undefined;
    return parts.join('+');
}
