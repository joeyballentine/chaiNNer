/* eslint-disable react/jsx-props-no-spreading */

import { memo, useCallback } from 'react';
import { useContext, useContextSelector } from 'use-context-selector';
import { Output, OutputId, OutputKind, SchemaId } from '../../../common/common-types';
import { Type } from '../../../common/types/types';
import { assertNever } from '../../../common/util';
import { ExecutionContext } from '../../contexts/ExecutionContext';
import { GlobalContext } from '../../contexts/GlobalNodeState';
import { DefaultImageOutput } from '../outputs/DefaultImageOutput';
import { DirectoryOutput } from '../outputs/DirectoryOutput';
import { GenericOutput } from '../outputs/GenericOutput';
import { LargeImageOutput } from '../outputs/LargeImageOutput';
import { OutputContainer } from '../outputs/OutputContainer';
import { OutputProps } from '../outputs/props';
import { TextOutput } from '../outputs/TextOutput';

interface FullOutputProps extends Omit<Output, 'id' | 'type'>, OutputProps {
    definitionType: Type;
}

// TODO: perhaps make this an object instead of a switch statement
const pickOutput = (kind: OutputKind, props: FullOutputProps) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let OutputType: React.MemoExoticComponent<(props: any) => JSX.Element> = GenericOutput;
    let isGenericType = true;
    switch (kind) {
        case 'image':
            OutputType = DefaultImageOutput;
            break;
        case 'large-image':
            OutputType = LargeImageOutput;
            isGenericType = false;
            break;
        case 'directory':
            OutputType = DirectoryOutput;
            break;
        case 'text':
            OutputType = TextOutput;
            break;
        case 'generic':
            OutputType = GenericOutput;
            break;
        default:
            return assertNever(kind);
    }
    return (
        <OutputContainer
            definitionType={props.definitionType}
            generic={isGenericType}
            hasHandle={props.hasHandle}
            id={props.id}
            key={`${props.id}-${props.outputId}`}
            label={props.label}
            outputId={props.outputId}
        >
            <OutputType {...props} />
        </OutputContainer>
    );
};

interface NodeOutputProps {
    outputs: readonly Output[];
    id: string;
    schemaId: SchemaId;
    animated?: boolean;
}

export const NodeOutputs = memo(({ outputs, id, schemaId, animated = false }: NodeOutputProps) => {
    const { functionDefinitions } = useContext(GlobalContext);
    const useOutputDataContext = useContextSelector(ExecutionContext, (c) => c.useOutputData);

    const useOutputData = useCallback(
        // eslint-disable-next-line react-hooks/rules-of-hooks
        (outputId: OutputId) => useOutputDataContext(id, outputId),
        [useOutputDataContext, id]
    );

    const functions = functionDefinitions.get(schemaId)!.outputDefaults;
    return (
        <>
            {outputs.map((output) => {
                const props: FullOutputProps = {
                    ...output,
                    id,
                    outputId: output.id,
                    useOutputData,
                    kind: output.kind,
                    schemaId,
                    definitionType: functions.get(output.id)!,
                    hasHandle: output.hasHandle,
                    animated,
                };
                return pickOutput(output.kind, props);
            })}
        </>
    );
});
