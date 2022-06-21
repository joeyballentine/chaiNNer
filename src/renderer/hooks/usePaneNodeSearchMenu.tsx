import { CloseIcon, SearchIcon } from '@chakra-ui/icons';
import {
    Box,
    HStack,
    Input,
    InputGroup,
    InputLeftElement,
    InputRightElement,
    MenuList,
    Text,
    useColorModeValue,
} from '@chakra-ui/react';
import log from 'electron-log';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Node, OnConnectStartParams, useReactFlow } from 'react-flow-renderer';
import { useContext } from 'use-context-selector';
import { NodeData, NodeSchema } from '../../common/common-types';
import { createUniqueId, parseHandle } from '../../common/util';
import { IconFactory } from '../components/CustomIcons';
import { ContextMenuContext } from '../contexts/ContextMenuContext';
import { GlobalContext, GlobalVolatileContext, NodeProto } from '../contexts/GlobalNodeState';
import getNodeAccentColors from '../helpers/getNodeAccentColors';
import { getMatchingNodes, getNodesByCategory } from '../helpers/nodeSearchFuncs';
import { useContextMenu } from './useContextMenu';

interface UsePaneNodeSearchMenuValue {
    readonly onConnectStart: (event: React.MouseEvent, handle: OnConnectStartParams) => void;
    readonly onConnectStop: (event: MouseEvent) => void;
    readonly onPaneContextMenu: (event: React.MouseEvent) => void;
}

export const usePaneNodeSearchMenu = (
    wrapperRef: React.RefObject<HTMLDivElement>
): UsePaneNodeSearchMenuValue => {
    const { createNode, createConnection } = useContext(GlobalVolatileContext);
    const { closeContextMenu } = useContext(ContextMenuContext);
    const { schemata } = useContext(GlobalContext);

    const [connectingFrom, setConnectingFrom] = useState<OnConnectStartParams | null>();
    const [connectingFromType, setConnectingFromType] = useState<string | null>();
    const [isStoppedOnPane, setIsStoppedOnPane] = useState<boolean>(false);
    const { getNode, project } = useReactFlow();

    const [searchQuery, setSearchQuery] = useState<string>('');
    const matchingNodes = useMemo(
        () =>
            getMatchingNodes(searchQuery, schemata.schemata).filter((node) => {
                if (!connectingFrom || !connectingFromType) {
                    return true;
                }
                if (connectingFrom.handleType === 'source') {
                    return node.inputs.some((input) => {
                        return connectingFromType === input.type && input.hasHandle;
                    });
                }
                if (connectingFrom.handleType === 'target') {
                    return node.outputs.some((output) => {
                        return connectingFromType === output.type;
                    });
                }
                log.error(`Unknown handle type: ${connectingFrom.handleType!}`);
                return true;
            }),
        [connectingFrom, connectingFromType, searchQuery, schemata.schemata]
    );
    const byCategories = useMemo(() => getNodesByCategory(matchingNodes), [matchingNodes]);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSearchQuery('');
    }, [connectingFrom]);

    const onPaneContextMenuNodeClick = useCallback(
        (node: NodeSchema, position: { x: number; y: number }) => {
            const reactFlowBounds = wrapperRef.current!.getBoundingClientRect();
            const { x, y } = position;
            const projPosition = project({
                x: x - reactFlowBounds.left,
                y: y - reactFlowBounds.top,
            });
            const nodeId = createUniqueId();
            const nodeToMake: NodeProto = {
                id: nodeId,
                position: projPosition,
                data: {
                    schemaId: node.schemaId,
                },
                nodeType: node.nodeType,
            };
            createNode(nodeToMake);
            if (isStoppedOnPane && connectingFrom) {
                if (connectingFrom.handleType === 'source') {
                    const firstValidHandle = schemata
                        .get(node.schemaId)!
                        .inputs.find(
                            (input) => input.type === connectingFromType && input.hasHandle
                        )!.id;
                    createConnection({
                        source: connectingFrom.nodeId,
                        sourceHandle: connectingFrom.handleId,
                        target: nodeId,
                        targetHandle: `${nodeId}-${firstValidHandle}`,
                    });
                } else if (connectingFrom.handleType === 'target') {
                    const firstValidHandle = schemata
                        .get(node.schemaId)!
                        .outputs.find((output) => output.type === connectingFromType)!.id;
                    createConnection({
                        source: nodeId,
                        sourceHandle: `${nodeId}-${firstValidHandle}`,
                        target: connectingFrom.nodeId,
                        targetHandle: connectingFrom.handleId,
                    });
                } else {
                    log.error(`Unknown handle type: ${connectingFrom.handleType!}`);
                }
            }

            setConnectingFrom(null);
            closeContextMenu();
        },
        [
            connectingFrom,
            createConnection,
            createNode,
            schemata,
            connectingFromType,
            isStoppedOnPane,
        ]
    );

    const menu = useContextMenu(
        () => (
            <MenuList
                bgColor="gray.800"
                borderWidth={0}
                className="nodrag"
                ref={menuRef}
            >
                <InputGroup
                    borderBottomWidth={1}
                    borderRadius={0}
                >
                    <InputLeftElement
                        color={useColorModeValue('gray.500', 'gray.300')}
                        pointerEvents="none"
                    >
                        <SearchIcon />
                    </InputLeftElement>
                    <Input
                        autoFocus
                        borderRadius={0}
                        placeholder="Search..."
                        spellCheck={false}
                        type="text"
                        value={searchQuery}
                        variant="filled"
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <InputRightElement
                        _hover={{ color: useColorModeValue('black', 'white') }}
                        style={{
                            color: useColorModeValue('gray.500', 'gray.300'),
                            cursor: 'pointer',
                            display: searchQuery ? undefined : 'none',
                            fontSize: '66%',
                        }}
                        onClick={() => setSearchQuery('')}
                    >
                        <CloseIcon />
                    </InputRightElement>
                </InputGroup>
                <Box
                    h="auto"
                    maxH={400}
                    overflowY="scroll"
                    p={1}
                >
                    {[...byCategories].map(([category, categoryNodes]) => {
                        const accentColor = getNodeAccentColors(category);
                        return (
                            <Box key={category}>
                                <HStack
                                    borderRadius="md"
                                    mx={1}
                                    py={0.5}
                                >
                                    <IconFactory
                                        accentColor={accentColor}
                                        boxSize={3}
                                        icon={category}
                                    />
                                    <Text fontSize="xs">{category}</Text>
                                </HStack>
                                {[...categoryNodes].map((node) => (
                                    <HStack
                                        _hover={{ backgroundColor: 'gray.700' }}
                                        borderRadius="md"
                                        key={node.schemaId}
                                        mx={1}
                                        px={2}
                                        py={0.5}
                                        onClick={() => {
                                            const position =
                                                menuRef.current!.getBoundingClientRect();
                                            setSearchQuery('');
                                            onPaneContextMenuNodeClick(node, position);
                                        }}
                                    >
                                        <IconFactory
                                            accentColor="gray.500"
                                            icon={node.icon}
                                        />
                                        <Text>{node.name}</Text>
                                    </HStack>
                                ))}
                            </Box>
                        );
                    })}
                </Box>
            </MenuList>
        ),
        [
            connectingFrom,
            connectingFromType,
            byCategories,
            onPaneContextMenuNodeClick,
            searchQuery,
            schemata.schemata,
            matchingNodes,
        ]
    );

    useEffect(() => {
        if (connectingFrom) {
            const { nodeId, inOutId } = parseHandle(connectingFrom.handleId!);
            const node: Node<NodeData> | undefined = getNode(nodeId);
            if (node) {
                const nodeSchema = schemata.get(node.data.schemaId);
                if (connectingFrom.handleType === 'source') {
                    const outputType = nodeSchema.outputs[inOutId]?.type;
                    setConnectingFromType(outputType);
                } else if (connectingFrom.handleType === 'target') {
                    const inputType = nodeSchema.inputs[inOutId]?.type;
                    setConnectingFromType(inputType);
                } else {
                    log.error(`Unknown handle type: ${connectingFrom.handleType!}`);
                }
            }
        }
    }, [connectingFrom]);

    const onConnectStart = useCallback(
        (event: React.MouseEvent, handle: OnConnectStartParams) => {
            setIsStoppedOnPane(false);
            setConnectingFrom(handle);
        },
        [setConnectingFrom, setIsStoppedOnPane]
    );

    const [coordinates, setCoordinates] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    const onConnectStop = useCallback(
        (event: MouseEvent) => {
            setIsStoppedOnPane(
                (event.ctrlKey || event.altKey) &&
                    String((event.target as Element).className).includes('pane')
            );
            setCoordinates({
                x: event.pageX,
                y: event.pageY,
            });
        },
        [setCoordinates, setIsStoppedOnPane]
    );

    const onPaneContextMenu = useCallback(
        (event: React.MouseEvent) => {
            setConnectingFrom(null);
            setSearchQuery('');
            menu.onContextMenu(event);
        },
        [setConnectingFrom, menu]
    );

    useEffect(() => {
        if (isStoppedOnPane && connectingFrom) {
            const { x, y } = coordinates;
            menu.manuallyOpenContextMenu(x, y);
        }
    });

    return { onConnectStart, onConnectStop, onPaneContextMenu };
};
