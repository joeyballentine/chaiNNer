import log from 'electron-log';
import { InputData, InputId, InputValue, NodeSchema, SchemaId } from './common-types';

const BLANK_SCHEMA: NodeSchema = {
    inputs: [],
    outputs: [],
    icon: '',
    category: '',
    subcategory: '',
    name: '',
    description: '',
    nodeType: '',
    schemaId: '' as SchemaId,
    hasSideEffects: false,
    deprecated: false,
};

export class SchemaMap {
    readonly schemata: readonly NodeSchema[];

    private readonly lookup: ReadonlyMap<SchemaId, NodeSchema>;

    constructor(schemata: readonly NodeSchema[]) {
        // defensive copy
        this.schemata = [...schemata];
        this.lookup = new Map<SchemaId, NodeSchema>(schemata.map((n) => [n.schemaId, n] as const));
    }

    has(schemaId: SchemaId): boolean {
        return this.lookup.has(schemaId);
    }

    get(schemaId: SchemaId, defaultValue = BLANK_SCHEMA): NodeSchema {
        const schema: NodeSchema | undefined = this.lookup.get(schemaId);
        if (schema === undefined) {
            log.warn(`Unknown node schema ${schemaId}. Returning blank schema.`);
        }
        return schema ?? defaultValue;
    }

    getDefaultInput(schemaId: SchemaId): InputData {
        const defaultData: Record<InputId, InputValue> = {};
        const { inputs } = this.get(schemaId);
        inputs.forEach((input) => {
            if (input.def || input.def === 0) {
                defaultData[input.id] = input.def;
            } else if (input.default || input.default === 0) {
                defaultData[input.id] = input.default;
            } else if (input.options) {
                defaultData[input.id] = input.options[0].value;
            }
        });
        return defaultData;
    }
}
