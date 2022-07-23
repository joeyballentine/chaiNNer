import { OutputId, SchemaId } from '../../../common/common-types';
import { Type } from '../../../common/types/types';

export interface OutputProps {
    readonly id: string;
    readonly outputId: OutputId;
    readonly label: string;
    readonly schemaId: SchemaId;
    readonly definitionType: Type;
    readonly hasHandle: boolean;
    readonly useOutputData: (outputId: OutputId) => unknown;
    readonly animated: boolean;
}
