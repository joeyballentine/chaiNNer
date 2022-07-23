import { CloseIcon, SearchIcon, StarIcon } from '@chakra-ui/icons';
import {
    Box,
    Center,
    HStack,
    Input,
    InputGroup,
    InputLeftElement,
    InputRightElement,
    MenuList,
    Spacer,
    Text,
    useColorModeValue,
    useToken,
} from '@chakra-ui/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Node, OnConnectStartParams, useReactFlow } from 'react-flow-renderer';
import { useContext } from 'use-context-selector';
import { InputId, NodeData, NodeSchema, OutputId, SchemaId } from '../../common/common-types';
import { FunctionDefinition } from '../../common/types/function';
import { Type } from '../../common/types/types';
import {
    assertNever,
    createUniqueId,
    parseSourceHandle,
    parseTargetHandle,
} from '../../common/util';
import { IconFactory } from '../components/CustomIcons';
import { ContextMenuContext } from '../contexts/ContextMenuContext';
import { GlobalContext, GlobalVolatileContext } from '../contexts/GlobalNodeState';
import { interpolateColor } from '../helpers/colorTools';
import { getNodeAccentColor } from '../helpers/getNodeAccentColor';
import { getMatchingNodes, getNodesByCategory, sortSchemata } from '../helpers/nodeSearchFuncs';
import { TypeState } from '../helpers/TypeState';
import { useContextMenu } from './useContextMenu';
import { useNodeFavorites } from './useNodeFavorites';

interface MenuProps {
    onSelect: (schema: NodeSchema) => void;
    schemata: readonly NodeSchema[];
    favorites: ReadonlySet<SchemaId>;
}

const Menu = memo(({ onSelect, schemata, favorites }: MenuProps) => {
    const [searchQuery, setSearchQuery] = useState('');

    const byCategories = useMemo(
        () => getNodesByCategory(getMatchingNodes(searchQuery, sortSchemata(schemata))),
        [searchQuery, schemata]
    );

    const [gray200, gray800] = useToken('colors', ['gray.200', 'gray.800']) as string[];
    const menuBgColor = useColorModeValue(gray200, gray800);
    const [gray300, gray700] = useToken('colors', ['gray.300', 'gray.700']) as string[];
    const bgColor = useColorModeValue(gray300, gray700);
    const inputColor = useColorModeValue('gray.500', 'gray.300');
    const hoverColor = useColorModeValue('black', 'white');

    return (
        <MenuList
            bgColor={menuBgColor}
            borderWidth={0}
            className="nodrag"
            overflow="hidden"
            onContextMenu={(e) => e.stopPropagation()}
        >
            <InputGroup
                borderBottomWidth={1}
                borderRadius={0}
            >
                <InputLeftElement
                    color={inputColor}
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
                    _hover={{ color: hoverColor }}
                    style={{
                        color: inputColor,
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
                {byCategories.size > 0 ? (
                    [...byCategories].map(([category, categorySchemata]) => {
                        const accentColor = getNodeAccentColor(category);
                        const gradL = interpolateColor(accentColor, menuBgColor, 0.95);
                        const gradR = menuBgColor;
                        const hoverGradL = interpolateColor(accentColor, bgColor, 0.95);
                        const hoverGradR = bgColor;
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
                                {[...categorySchemata].map((schema) => {
                                    const isFavorite = favorites.has(schema.schemaId);
                                    return (
                                        <HStack
                                            _hover={{
                                                bgGradient: `linear(to-r, ${hoverGradL}, ${hoverGradR})`,
                                            }}
                                            bgGradient={`linear(to-r, ${gradL}, ${gradR})`}
                                            borderRadius="md"
                                            key={schema.schemaId}
                                            mx={1}
                                            my={0.5}
                                            px={2}
                                            py={0.5}
                                            onClick={() => {
                                                setSearchQuery('');
                                                onSelect(schema);
                                            }}
                                        >
                                            <IconFactory
                                                accentColor="gray.500"
                                                icon={schema.icon}
                                            />
                                            <Text
                                                h="full"
                                                verticalAlign="middle"
                                            >
                                                {schema.name}
                                            </Text>
                                            (
                                            {isFavorite && (
                                                <>
                                                    <Spacer />
                                                    <StarIcon
                                                        aria-label="Favorites"
                                                        boxSize={2.5}
                                                        color="gray.500"
                                                        overflow="hidden"
                                                        stroke="gray.500"
                                                        verticalAlign="middle"
                                                    />
                                                </>
                                            )}
                                            )
                                        </HStack>
                                    );
                                })}
                            </Box>
                        );
                    })
                ) : (
                    <Center
                        opacity="50%"
                        w="full"
                    >
                        No compatible nodes found.
                    </Center>
                )}
            </Box>
        </MenuList>
    );
});

const getFirstPossibleInput = (fn: FunctionDefinition, type: Type): InputId | undefined =>
    fn.schema.inputs.find((i) => i.hasHandle && fn.canAssignInput(i.id, type))?.id;
const getFirstPossibleOutput = (fn: FunctionDefinition, type: Type): OutputId | undefined =>
    fn.schema.outputs.find((o) => o.hasHandle && fn.canAssignOutput(o.id, type))?.id;

const canConnectWith = (
    connectingFrom: OnConnectStartParams,
    schema: NodeSchema,
    typeState: TypeState,
    functionDefinitions: ReadonlyMap<SchemaId, FunctionDefinition>,
    getNode: (id: string) => Node<NodeData> | undefined
): boolean => {
    if (!connectingFrom.nodeId || !connectingFrom.handleId || !connectingFrom.handleType) {
        return true;
    }
    switch (connectingFrom.handleType) {
        case 'source': {
            const { inOutId } = parseSourceHandle(connectingFrom.handleId);
            const sourceType = typeState.functions.get(connectingFrom.nodeId)?.outputs.get(inOutId);
            if (!sourceType) {
                return false;
            }

            const targetFn = functionDefinitions.get(schema.schemaId);
            if (!targetFn) {
                return false;
            }

            return getFirstPossibleInput(targetFn, sourceType) !== undefined;
        }
        case 'target': {
            const sourceNode = getNode(connectingFrom.nodeId);
            if (!sourceNode) {
                return false;
            }
            const sourceFn = functionDefinitions.get(sourceNode.data.schemaId);
            if (!sourceFn) {
                return false;
            }

            const { inOutId } = parseTargetHandle(connectingFrom.handleId);
            const sourceType = sourceFn.inputDefaults.get(inOutId);
            if (!sourceType) {
                return false;
            }

            const targetFn = functionDefinitions.get(schema.schemaId);
            if (!targetFn) {
                return false;
            }

            return getFirstPossibleOutput(targetFn, sourceType) !== undefined;
        }
        default:
            assertNever(connectingFrom.handleType);
    }
    return true;
};

interface UsePaneNodeSearchMenuValue {
    readonly onConnectStart: (event: React.MouseEvent, handle: OnConnectStartParams) => void;
    readonly onConnectStop: (event: MouseEvent) => void;
    readonly onPaneContextMenu: (event: React.MouseEvent) => void;
}

interface Position {
    readonly x: number;
    readonly y: number;
}

export const usePaneNodeSearchMenu = (
    wrapperRef: React.RefObject<HTMLDivElement>
): UsePaneNodeSearchMenuValue => {
    const { createNode, createConnection, typeState, useConnectingFrom } =
        useContext(GlobalVolatileContext);
    const { closeContextMenu } = useContext(ContextMenuContext);
    const { schemata, functionDefinitions } = useContext(GlobalContext);

    const { favorites } = useNodeFavorites();

    const [connectingFrom, setConnectingFrom] = useState<OnConnectStartParams | null>(null);
    const [, setGlobalConnectingFrom] = useConnectingFrom;
    const [connectingFromType, setConnectingFromType] = useState<Type | null>(null);

    const [isStoppedOnPane, setIsStoppedOnPane] = useState(false);
    const { getNode, project } = useReactFlow();

    const [mousePosition, setMousePosition] = useState<Position>({ x: 0, y: 0 });

    const matchingSchemata = useMemo(
        () =>
            schemata.schemata.filter((schema) => {
                return (
                    !connectingFrom ||
                    !connectingFromType ||
                    canConnectWith(connectingFrom, schema, typeState, functionDefinitions, getNode)
                );
            }),
        [connectingFrom, connectingFromType, schemata, typeState, functionDefinitions, getNode]
    );

    const onSchemaSelect = useCallback(
        (schema: NodeSchema) => {
            const reactFlowBounds = wrapperRef.current!.getBoundingClientRect();
            const { x, y } = mousePosition;
            const projPosition = project({
                x: x - reactFlowBounds.left,
                y: y - reactFlowBounds.top,
            });
            const nodeId = createUniqueId();
            createNode({
                id: nodeId,
                position: projPosition,
                data: {
                    schemaId: schema.schemaId,
                },
                nodeType: schema.nodeType,
            });
            const targetFn = functionDefinitions.get(schema.schemaId);
            if (
                isStoppedOnPane &&
                connectingFrom &&
                targetFn &&
                connectingFromType &&
                connectingFrom.handleType
            ) {
                switch (connectingFrom.handleType) {
                    case 'source': {
                        const first = getFirstPossibleInput(targetFn, connectingFromType);
                        if (first !== undefined) {
                            createConnection({
                                source: connectingFrom.nodeId,
                                sourceHandle: connectingFrom.handleId,
                                target: nodeId,
                                targetHandle: `${nodeId}-${first}`,
                            });
                        }
                        break;
                    }
                    case 'target': {
                        const first = getFirstPossibleOutput(targetFn, connectingFromType);
                        if (first !== undefined) {
                            createConnection({
                                source: nodeId,
                                sourceHandle: `${nodeId}-${first}`,
                                target: connectingFrom.nodeId,
                                targetHandle: connectingFrom.handleId,
                            });
                        }
                        break;
                    }
                    default:
                        assertNever(connectingFrom.handleType);
                }
            }

            setConnectingFrom(null);
            closeContextMenu();
        },
        [
            connectingFrom,
            createConnection,
            createNode,
            connectingFromType,
            isStoppedOnPane,
            mousePosition,
        ]
    );

    const menuProps: MenuProps = {
        onSelect: onSchemaSelect,
        schemata: matchingSchemata,
        favorites,
    };
    // eslint-disable-next-line react/jsx-props-no-spreading
    const menu = useContextMenu(() => <Menu {...menuProps} />, Object.values(menuProps));

    useEffect(() => {
        if (connectingFrom && connectingFrom.handleId && connectingFrom.nodeId) {
            const node: Node<NodeData> | undefined = getNode(connectingFrom.nodeId);
            if (node?.data.parentNode) {
                setConnectingFrom(null);
                setConnectingFromType(null);
            }
            if (node && connectingFrom.handleType) {
                switch (connectingFrom.handleType) {
                    case 'source': {
                        const { inOutId } = parseSourceHandle(connectingFrom.handleId);
                        const sourceType = functionDefinitions
                            .get(node.data.schemaId)
                            ?.outputDefaults.get(inOutId);
                        setConnectingFromType(sourceType ?? null);
                        break;
                    }
                    case 'target': {
                        const { inOutId } = parseTargetHandle(connectingFrom.handleId);
                        const targetType = functionDefinitions
                            .get(node.data.schemaId)
                            ?.inputDefaults.get(inOutId);
                        setConnectingFromType(targetType ?? null);
                        break;
                    }
                    default:
                        assertNever(connectingFrom.handleType);
                }
            }
        }
    }, [connectingFrom]);

    const onConnectStart = useCallback(
        (event: React.MouseEvent, handle: OnConnectStartParams) => {
            setMousePosition({
                x: event.pageX,
                y: event.pageY,
            });
            setIsStoppedOnPane(false);
            setConnectingFrom(handle);
            setGlobalConnectingFrom(handle);
        },
        [setConnectingFrom, setIsStoppedOnPane]
    );

    const [coordinates, setCoordinates] = useState<Position>({ x: 0, y: 0 });

    const onConnectStop = useCallback(
        (event: MouseEvent) => {
            setIsStoppedOnPane(
                // TODO: Maybe make this a setting, idk
                // (event.ctrlKey || event.metaKey) &&
                String((event.target as Element).className).includes('pane')
            );
            setMousePosition({
                x: event.pageX,
                y: event.pageY,
            });
            setCoordinates({
                x: event.pageX,
                y: event.pageY,
            });
            setGlobalConnectingFrom(null);
        },
        [setCoordinates, setIsStoppedOnPane]
    );

    const onPaneContextMenu = useCallback(
        (event: React.MouseEvent) => {
            setMousePosition({
                x: event.pageX,
                y: event.pageY,
            });
            setConnectingFrom(null);
            menu.onContextMenu(event);
        },
        [setConnectingFrom, menu, setMousePosition]
    );

    useEffect(() => {
        if (isStoppedOnPane && connectingFrom) {
            const { x, y } = coordinates;
            menu.manuallyOpenContextMenu(x, y);
        }
    }, [isStoppedOnPane, connectingFrom]);

    return { onConnectStart, onConnectStop, onPaneContextMenu };
};
