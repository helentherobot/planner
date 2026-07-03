import { jsonSchema } from 'ai';
export function makeDiscoverable(name, description, schema, execute) {
    return {
        name,
        description,
        inputSchema: jsonSchema(schema),
        execute: execute,
    };
}
