import { Center, VStack, useColorModeValue } from '@chakra-ui/react';
import isDeepEqual from 'fast-deep-equal/react';
import path from 'path';
import { DragEvent, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from 'react-flow-renderer';
import { useContext, useContextSelector } from 'use-context-selector';
import { getBackend } from '../../../common/Backend';
import { EdgeData, Input, NodeData } from '../../../common/common-types';
import { AlertBoxContext } from '../../contexts/AlertBoxContext';
import { GlobalContext, GlobalVolatileContext } from '../../contexts/GlobalNodeState';
import { SettingsContext } from '../../contexts/SettingsContext';
import { Validity, checkNodeValidity } from '../../helpers/checkNodeValidity';
import { shadeColor } from '../../helpers/colorTools';
import { getSingleFileWithExtension } from '../../helpers/dataTransfer';
import { DisabledStatus } from '../../helpers/disabled';
import { getNodeAccentColor } from '../../helpers/getNodeAccentColor';
import { useAsyncEffect } from '../../hooks/useAsyncEffect';
import { useDisabled } from '../../hooks/useDisabled';
import { useNodeMenu } from '../../hooks/useNodeMenu';
import { NodeBody } from './NodeBody';
import { NodeFooter } from './NodeFooter/NodeFooter';
import { NodeHeader } from './NodeHeader';

/**
 * If there is only one file input, then this input will be returned. `undefined` otherwise.
 */
const getSingleFileInput = (inputs: readonly Input[]): Input | undefined => {
    const fileInputs = inputs.filter((i) => {
        switch (i.kind) {
            case 'file':
                return true;
            default:
                return false;
        }
    });

    return fileInputs.length === 1 ? fileInputs[0] : undefined;
};

export const Node = memo(({ data, selected }: NodeProps) => (
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    <NodeInner
        data={data}
        selected={selected}
    />
));

export interface NodeProps {
    data: NodeData;
    selected: boolean;
}

const NodeInner = memo(({ data, selected }: NodeProps) => {
    const { sendToast } = useContext(AlertBoxContext);
    const edgeChanges = useContextSelector(GlobalVolatileContext, (c) => c.edgeChanges);
    const { schemata, updateIteratorBounds, setHoveredNode, useInputData, changeNodes } =
        useContext(GlobalContext);
    const { getEdges } = useReactFlow<NodeData, EdgeData>();
    const { useIsCpu, useIsFp16, port } = useContext(SettingsContext);
    const backend = getBackend(port);

    const [isCpu] = useIsCpu;
    const [isFp16] = useIsFp16;

    const { id, inputData, inputSize, isLocked, parentNode, schemaId, animated = false } = data;

    // We get inputs and outputs this way in case something changes with them in the future
    // This way, we have to do less in the migration file
    const schema = schemata.get(schemaId);
    const { inputs, outputs, icon, category, name } = schema;

    const functionInstance = useContextSelector(GlobalVolatileContext, (c) =>
        c.typeState.functions.get(id)
    );

    const regularBorderColor = useColorModeValue('gray.200', 'gray.800');
    const accentColor = getNodeAccentColor(category);
    const borderColor = useMemo(
        () => (selected ? shadeColor(accentColor, 0) : regularBorderColor),
        [selected, accentColor, regularBorderColor]
    );

    const [validity, setValidity] = useState({
        isValid: false,
        reason: 'Validating nodes...',
    } as Validity);
    useEffect(() => {
        if (inputs.length) {
            setValidity(
                checkNodeValidity({
                    id,
                    schema,
                    inputData,
                    edges: getEdges(),
                    functionInstance,
                })
            );
        }
    }, [inputData, edgeChanges, functionInstance]);

    const targetRef = useRef<HTMLDivElement>(null);
    const [checkedSize, setCheckedSize] = useState(false);

    useLayoutEffect(() => {
        if (targetRef.current && parentNode) {
            updateIteratorBounds(parentNode, null, {
                width: targetRef.current.offsetWidth,
                height: targetRef.current.offsetHeight,
            });
            setCheckedSize(true);
        }
    }, [checkedSize, targetRef.current?.offsetHeight, updateIteratorBounds]);

    const fileInput = useMemo(() => getSingleFileInput(inputs), [inputs]);

    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();

        if (fileInput && fileInput.filetypes && event.dataTransfer.types.includes('Files')) {
            event.stopPropagation();

            // eslint-disable-next-line no-param-reassign
            event.dataTransfer.dropEffect = 'move';
        }
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();

        if (fileInput && fileInput.filetypes && event.dataTransfer.types.includes('Files')) {
            event.stopPropagation();

            const p = getSingleFileWithExtension(event.dataTransfer, fileInput.filetypes);
            if (p) {
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const [, setInput] = useInputData<string>(id, fileInput.id, inputData);
                setInput(p);
                return;
            }

            if (event.dataTransfer.files.length !== 1) {
                sendToast({
                    status: 'error',
                    description: `Only one file is accepted by ${fileInput.label}.`,
                });
            } else {
                const ext = path.extname(event.dataTransfer.files[0].path);
                sendToast({
                    status: 'error',
                    description: `${fileInput.label} does not accept ${ext} files.`,
                });
            }
        }
    };

    const disabled = useDisabled(data);
    const menu = useNodeMenu(data, disabled);

    const bgColor = useColorModeValue('gray.400', 'gray.750');
    const shadowColor = useColorModeValue('gray.600', 'gray.900');

    const inputDataRef = useRef(inputData);
    if (!isDeepEqual(inputDataRef.current, inputData)) {
        inputDataRef.current = inputData;
    }
    const [shouldRun, setShouldRun] = useState(false);
    useEffect(() => {
        setShouldRun(
            !isLocked &&
                !disabled.isDirectlyDisabled &&
                validity.isValid &&
                !inputs.some((i) => i.hasHandle) &&
                Object.values(inputData).length >= inputs.filter((i) => !i.optional).length
        );
    }, [inputDataRef.current, validity.isValid]);

    useAsyncEffect(async () => {
        if (shouldRun) {
            changeNodes((nodes) =>
                nodes.map((n) => {
                    if (n.id === id) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                animated: true,
                            },
                        };
                    }
                    return n;
                })
            );

            const result = await backend.runIndividual({
                schemaId,
                id,
                inputs: Object.values(inputData),
                isCpu,
                isFp16,
            });

            changeNodes((nodes) =>
                nodes.map((n) => {
                    if (n.id === id) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                animated: false,
                            },
                        };
                    }
                    return n;
                })
            );

            if (!result.success) {
                sendToast({
                    status: 'error',
                    title: 'Error',
                    description: 'Image failed to load, probably unsupported file type.',
                });
            }
            setShouldRun(false);
        }
    }, [shouldRun]);

    return (
        <Center
            bg={bgColor}
            borderColor={borderColor}
            borderRadius="lg"
            borderWidth="0.5px"
            boxShadow={`${selected ? 10 : 6}px ${selected ? 10 : 6}px ${
                selected ? 12 : 8
            }px ${shadowColor}8F`}
            opacity={disabled.status === DisabledStatus.Enabled ? 1 : 0.75}
            overflow="hidden"
            ref={targetRef}
            transition="0.15s ease-in-out"
            onContextMenu={menu.onContextMenu}
            onDragEnter={() => {
                if (parentNode) {
                    setHoveredNode(parentNode);
                }
            }}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            <VStack
                minWidth="240px"
                opacity={disabled.status === DisabledStatus.Enabled ? 1 : 0.75}
                spacing={0}
            >
                <VStack w="full">
                    <NodeHeader
                        accentColor={accentColor}
                        disabledStatus={disabled.status}
                        icon={icon}
                        name={name}
                        parentNode={parentNode}
                        selected={selected}
                    />
                    <NodeBody
                        accentColor={accentColor}
                        animated={animated}
                        id={id}
                        inputData={inputData}
                        inputSize={inputSize}
                        inputs={inputs}
                        isLocked={isLocked}
                        outputs={outputs}
                        schemaId={schemaId}
                    />
                </VStack>
                <NodeFooter
                    animated={animated}
                    useDisable={disabled}
                    validity={validity}
                />
            </VStack>
        </Center>
    );
});
