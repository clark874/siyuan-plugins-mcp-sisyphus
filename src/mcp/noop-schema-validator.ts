import type { JsonSchemaType, JsonSchemaValidator, JsonSchemaValidatorResult, jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';

// No-op JSON schema validator. The MCP SDK only uses this for
// server.elicitInput(), which this project does not invoke.
// If elicitInput is ever added, replace this with a real validator.
export class AjvJsonSchemaValidator implements jsonSchemaValidator {
    constructor(_ajv?: unknown) {
        // Keep the constructor shape compatible with the SDK AJV provider.
    }

    getValidator<T>(_schema: JsonSchemaType): JsonSchemaValidator<T> {
        return (input: unknown): JsonSchemaValidatorResult<T> => ({
            valid: true,
            data: input as T,
            errorMessage: undefined,
        });
    }
}

export const noopSchemaValidator = new AjvJsonSchemaValidator();
