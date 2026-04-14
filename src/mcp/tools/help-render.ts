import type { ToolCategory } from '../config';
import { getSchemaProperties, getSchemaRequired, type ActionVariant, type JsonSchema } from './shared';

function getSchemaRequiredWithoutAction(schema: JsonSchema): string[] {
    return getSchemaRequired(schema).filter(field => field !== 'action');
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
            return ['20240318112233-a', '20240318112233-b'];
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
            return '# Weekly Notes\n\n- Seed item';
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

// Re-export alias for backward compatibility with resources.ts style callers.
export function buildActionExamplesMarkdown<Action extends string>(
    variants: ActionVariant<Action>[],
    action: string,
): string[] {
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
