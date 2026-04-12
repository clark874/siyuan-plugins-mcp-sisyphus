import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError, z } from 'zod';
import {
    createActionSchema,
    getSchemaProperties,
    getSchemaRequired,
    createJsonResult,
    createErrorResult,
    createPermissionDeniedResult,
    createDisabledActionResult,
    buildAggregatedTool,
    type JsonSchema,
    type ActionVariant,
} from '@/mcp/tools/shared';
import type { ToolCategory, CategoryToolConfig } from '@/mcp/config';

describe('createActionSchema', () => {
    it('should create schema with action and properties', () => {
        const properties: JsonSchema = {
            name: { type: 'string' },
            count: { type: 'number' },
        };
        const schema = createActionSchema('test', properties, ['name'], 'Test description');

        expect(schema.type).toBe('object');
        expect(schema.description).toBe('Test description');
        expect(schema.additionalProperties).toBe(false);
        expect(schema.properties?.action).toEqual({
            type: 'string',
            const: 'test',
            description: 'Action to perform',
        });
        expect(schema.properties?.name).toEqual({ type: 'string' });
        expect(schema.required).toEqual(['action', 'name']);
    });

    it('should create schema with no additional properties', () => {
        const schema = createActionSchema('empty', {}, [], 'Empty schema');

        expect(schema.properties?.action?.const).toBe('empty');
        expect(schema.required).toEqual(['action']);
    });
});

describe('getSchemaProperties', () => {
    it('should return properties from schema', () => {
        const schema: JsonSchema = {
            type: 'object',
            properties: {
                foo: { type: 'string' },
                bar: { type: 'number' },
            },
        };
        expect(getSchemaProperties(schema)).toEqual({
            foo: { type: 'string' },
            bar: { type: 'number' },
        });
    });

    it('should return empty object for schema without properties', () => {
        expect(getSchemaProperties({})).toEqual({});
        expect(getSchemaProperties({ type: 'object' })).toEqual({});
    });

    it('should handle non-object properties', () => {
        const schema: JsonSchema = { properties: 'invalid' as unknown as JsonSchema };
        expect(getSchemaProperties(schema)).toEqual({});
    });
});

describe('getSchemaRequired', () => {
    it('should return required fields from schema', () => {
        const schema: JsonSchema = {
            type: 'object',
            required: ['foo', 'bar'],
        };
        expect(getSchemaRequired(schema)).toEqual(['foo', 'bar']);
    });

    it('should filter out non-string required values', () => {
        const schema: JsonSchema = {
            type: 'object',
            required: ['foo', 123, 'bar', null],
        };
        expect(getSchemaRequired(schema)).toEqual(['foo', 'bar']);
    });

    it('should return empty array for schema without required', () => {
        expect(getSchemaRequired({})).toEqual([]);
        expect(getSchemaRequired({ type: 'object' })).toEqual([]);
    });
});

describe('createJsonResult', () => {
    it('should create result with JSON content', () => {
        const data = { foo: 'bar', count: 42 };
        const result = createJsonResult(data);

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
        expect(result.isError).toBeUndefined();
    });

    it('should handle null value', () => {
        const result = createJsonResult(null);
        expect(result.content[0].text).toBe('null');
    });

    it('should handle nested objects', () => {
        const data = { nested: { deep: { value: 1 } }, list: [1, 2, 3] };
        const result = createJsonResult(data);
        expect(JSON.parse(result.content[0].text)).toEqual(data);
    });
});

describe('createErrorResult', () => {
    it('should create error result from Error', () => {
        const error = new Error('Something went wrong');
        const result = createErrorResult(error);

        expect(result.isError).toBe(true);
        expect(result.content[0].type).toBe('text');
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.message).toBe('Something went wrong');
        expect(parsed.error.type).toBe('internal_error');
    });

    it('should create error result from API error', () => {
        const error = new Error('SiYuan API error: 404 - Not found');
        const result = createErrorResult(error);

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.type).toBe('api_error');
    });

    it('should include context in error result', () => {
        const error = new Error('Test error');
        const result = createErrorResult(error, {
            tool: 'notebook',
            action: 'create',
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.tool).toBe('notebook');
        expect(parsed.error.action).toBe('create');
    });

    it('should handle ZodError for validation errors', () => {
        const schema = z.object({ name: z.string(), count: z.number() });
        const parseResult = schema.safeParse({ name: 123, count: 'not a number' });

        expect(parseResult.success).toBe(false);
        if (!parseResult.success) {
            const result = createErrorResult(parseResult.error);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.error.type).toBe('validation_error');
            expect(parsed.error.fields).toBeDefined();
            expect(parsed.error.fields.length).toBeGreaterThan(0);
        }
    });

    it('should handle non-Error values', () => {
        const result = createErrorResult('string error');
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.message).toBe('string error');
    });
});

describe('createPermissionDeniedResult', () => {
    it('should create permission denied result', () => {
        const result = createPermissionDeniedResult('notebook123', 'r', 'delete');

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.type).toBe('permission_denied');
        expect(parsed.error.notebook).toBe('notebook123');
        expect(parsed.error.current_permission).toBe('r');
        expect(parsed.error.required_permission).toBe('delete');
    });

    it('should include helpful message', () => {
        const result = createPermissionDeniedResult('nb', 'none', 'read');
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.message).toContain('notebook');
        expect(parsed.error.message).toContain('set_permission');
    });
});

describe('createDisabledActionResult', () => {
    it('should create disabled action result', () => {
        const result = createDisabledActionResult('notebook' as ToolCategory, 'delete');

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.type).toBe('action_disabled');
        expect(parsed.error.tool).toBe('notebook');
        expect(parsed.error.action).toBe('delete');
        expect(parsed.error.hint).toContain('Settings');
    });
});

describe('buildAggregatedTool', () => {
    const mockConfig: CategoryToolConfig<string> = {
        enabled: true,
        actions: {
            list: true,
            create: true,
            remove: false,
        },
    };

    const variants: ActionVariant<string>[] = [
        { action: 'list', schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
        { action: 'create', schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
        { action: 'remove', schema: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] } },
    ];

    it('should return empty array when tool is disabled', () => {
        const config = { ...mockConfig, enabled: false };
        const result = buildAggregatedTool('notebook', 'Test tool', config, variants);
        expect(result).toEqual([]);
    });

    it('should return empty array when no actions enabled', () => {
        const config = {
            enabled: true,
            actions: { list: false, create: false },
        };
        const result = buildAggregatedTool('notebook', 'Test tool', config, variants);
        expect(result).toEqual([]);
    });

    it('should build tool with enabled actions only', () => {
        const result = buildAggregatedTool('notebook', 'Test tool', mockConfig, variants);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('notebook');
        expect(result[0].inputSchema.properties?.action?.enum).toEqual(['list', 'create', 'help']);
    });

    it('should include description with action list', () => {
        const result = buildAggregatedTool('notebook', 'Test tool', mockConfig, variants);

        expect(result[0].description).toContain('Test tool');
        expect(result[0].description).toContain('list');
        expect(result[0].description).toContain('create');
    });

    it('should include merged properties from all variants', () => {
        const result = buildAggregatedTool('notebook', 'Test tool', mockConfig, variants);
        const schema = result[0].inputSchema;

        expect(schema.properties?.id).toBeDefined();
        expect(schema.properties?.name).toBeDefined();
    });

    it('should handle guidance option', () => {
        const options = {
            guidance: ['Note: Be careful with this tool.'],
        };
        const result = buildAggregatedTool('notebook', 'Test tool', mockConfig, variants, options);

        expect(result[0].description).toContain('Be careful');
    });

    it('should include confirmation note for dangerous actions', () => {
        const configWithDangerous = {
            enabled: true,
            actions: { list: true, create: true, remove: true },
        };
        const result = buildAggregatedTool('notebook', 'Test tool', configWithDangerous, variants);

        expect(result[0].description).toContain('confirmation');
        expect(result[0].description).toContain('remove');
    });
});
