import minimist from 'minimist';

type JsonSchema = Record<string, any>;

export interface FlagMapResult {
    args: Record<string, unknown>;
    warnings: string[];
}

/**
 * Convert CLI flags to a MCP tool-action argument payload, using the tool's
 * inputSchema as the authoritative source for property names and types.
 *
 * - Accepts kebab-case (--parent-id), camelCase (--parentID), or exact match.
 * - Boolean flags: --flag (true), --no-flag (false), --flag=false.
 * - Array flags: repeat the flag, or pass a comma-separated string.
 * - Object / nested flags: use --<key>-json '<json-fragment>'.
 */
export function mapFlagsToArgs(rest: string[], inputSchema: JsonSchema): FlagMapResult {
    const props: Record<string, JsonSchema> = (inputSchema.properties ?? {}) as Record<string, JsonSchema>;

    const canonicalByLower = new Map<string, string>();
    const booleanKeys = new Set<string>();
    const stringKeys = new Set<string>();
    for (const [name, schema] of Object.entries(props)) {
        if (name === 'action' || name === 'topic') continue;
        const lower = name.toLowerCase();
        canonicalByLower.set(lower, name);
        canonicalByLower.set(toKebab(name).toLowerCase(), name);
        const type = inferType(schema);
        if (type === 'boolean') {
            booleanKeys.add(name);
            booleanKeys.add(toKebab(name));
        } else {
            stringKeys.add(name);
            stringKeys.add(toKebab(name));
        }
    }

    // Every potential --<key>-json sidecar is declared as string so values
    // starting with a brace or bracket aren't eaten as the next flag.
    const jsonSidecarKeys: string[] = [];
    for (const name of Object.keys(props)) {
        if (name === 'action' || name === 'topic') continue;
        const kebab = toKebab(name);
        jsonSidecarKeys.push(`${kebab}-json`);
        if (kebab !== name) jsonSidecarKeys.push(`${name}-json`);
    }

    const parsed = minimist(rest, {
        boolean: [...booleanKeys],
        string: [...stringKeys, ...jsonSidecarKeys],
    });

    const result: Record<string, unknown> = {};
    const warnings: string[] = [];

    for (const [rawKey, rawVal] of Object.entries(parsed)) {
        if (rawKey === '_') continue;

        // JSON-sidecar: --parent-id-json, --assets-json, etc.
        if (rawKey.endsWith('-json')) {
            const baseKey = rawKey.slice(0, -'-json'.length);
            const canonical = canonicalByLower.get(baseKey.toLowerCase());
            if (!canonical) {
                warnings.push(`Unknown flag --${rawKey}.`);
                continue;
            }
            if (typeof rawVal !== 'string' || rawVal.length === 0) continue;
            try {
                result[canonical] = JSON.parse(rawVal);
            } catch (error) {
                throw new Error(`--${rawKey} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
            }
            continue;
        }

        const canonical = canonicalByLower.get(rawKey.toLowerCase());
        if (!canonical) {
            warnings.push(`Unknown flag --${rawKey}; ignored.`);
            continue;
        }

        if (canonical in result) continue; // avoid double-assignment from alias+original
        const schema = props[canonical];
        result[canonical] = coerce(canonical, rawVal, schema);
    }

    if (parsed._.length > 0) {
        warnings.push(`Extra positional arguments ignored: ${parsed._.join(' ')}`);
    }

    return { args: result, warnings };
}

function coerce(key: string, value: unknown, schema: JsonSchema): unknown {
    const type = inferType(schema);

    if (type === 'array') {
        if (Array.isArray(value)) return value.map((v) => coerceItem(v, schema.items));
        if (typeof value === 'string') {
            return value.split(',').map((s) => coerceItem(s.trim(), schema.items));
        }
        return [value];
    }

    if (type === 'number' || type === 'integer') {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const n = type === 'integer' ? parseInt(value, 10) : parseFloat(value);
            if (Number.isNaN(n)) {
                throw new Error(`--${toKebab(key)} expected a number but got "${value}".`);
            }
            return n;
        }
        return value;
    }

    if (type === 'boolean') {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value === 'true' || value === '1' || value === 'yes';
        return Boolean(value);
    }

    if (type === 'object') {
        if (typeof value === 'object' && value !== null) return value;
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch {
                throw new Error(`--${toKebab(key)} expects JSON for an object field. Use --${toKebab(key)}-json '{"..."}'.`);
            }
        }
        return value;
    }

    // string fallback
    return typeof value === 'string' ? value : String(value);
}

function coerceItem(item: unknown, itemSchema?: JsonSchema): unknown {
    if (!itemSchema) return item;
    const type = inferType(itemSchema);
    if (type === 'number' || type === 'integer') {
        if (typeof item === 'string') return type === 'integer' ? parseInt(item, 10) : parseFloat(item);
    }
    if (type === 'boolean' && typeof item === 'string') {
        return item === 'true' || item === '1' || item === 'yes';
    }
    return item;
}

function inferType(schema: JsonSchema | undefined): string {
    if (!schema) return 'string';
    const type = schema.type;
    if (Array.isArray(type)) return type[0] ?? 'string';
    if (typeof type === 'string') return type;
    if (schema.enum) return 'string';
    if (schema.anyOf || schema.oneOf) return 'string'; // be conservative
    return 'string';
}

function toKebab(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
