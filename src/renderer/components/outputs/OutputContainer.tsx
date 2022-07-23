import { Box, Center, HStack, Text, chakra, useColorModeValue } from '@chakra-ui/react';
import React, { memo, useMemo } from 'react';
import { Connection, Handle, Position, useReactFlow } from 'react-flow-renderer';
import { useContext, useContextSelector } from 'use-context-selector';
import { OutputId } from '../../../common/common-types';
import { Type } from '../../../common/types/types';
import { parseSourceHandle } from '../../../common/util';
import { GlobalVolatileContext } from '../../contexts/GlobalNodeState';
import { SettingsContext } from '../../contexts/SettingsContext';
import { getTypeAccentColors } from '../../helpers/getTypeAccentColors';
import { noContextMenu } from '../../hooks/useContextMenu';
import { TypeTag } from '../TypeTag';

interface OutputContainerProps {
    hasHandle: boolean;
    outputId: OutputId;
    id: string;
    definitionType: Type;
    label: string;
    generic: boolean;
}

interface RightHandleProps {
    isValidConnection: (connection: Readonly<Connection>) => boolean;
}

// Had to do this garbage to prevent chakra from clashing the position prop
const RightHandle = memo(
    ({ children, isValidConnection, ...props }: React.PropsWithChildren<RightHandleProps>) => (
        <Handle
            isConnectable
            className="output-handle"
            isValidConnection={isValidConnection}
            position={Position.Right}
            type="source"
            // eslint-disable-next-line react/jsx-props-no-spreading
            {...props}
        >
            {children}
        </Handle>
    )
);

const Div = chakra('div', {
    baseStyle: {},
});

export const OutputContainer = memo(
    ({
        children,
        hasHandle,
        outputId,
        id,
        definitionType,
        label,
        generic,
    }: React.PropsWithChildren<OutputContainerProps>) => {
        const { isValidConnection, edgeChanges, useConnectingFrom } =
            useContext(GlobalVolatileContext);
        const { useIsDarkMode } = useContext(SettingsContext);
        const [isDarkMode] = useIsDarkMode;

        const { getEdges } = useReactFlow();
        const edges = useMemo(() => getEdges(), [edgeChanges]);
        const isConnected = !!edges.find(
            (e) => e.source === id && parseSourceHandle(e.sourceHandle!).inOutId === outputId
        );
        const [connectingFrom] = useConnectingFrom;

        const type = useContextSelector(GlobalVolatileContext, (c) =>
            c.typeState.functions.get(id)?.outputs.get(outputId)
        );

        const showHandle = useMemo(() => {
            // no active connection
            if (!connectingFrom) return true;

            // We only want to display the connectingFrom source handle
            if (connectingFrom.handleType === 'source')
                return connectingFrom.handleId === `${id}-${outputId}`;

            return isValidConnection({
                source: id,
                sourceHandle: `${id}-${outputId}`,
                target: connectingFrom.nodeId,
                targetHandle: connectingFrom.handleId,
            });
        }, [connectingFrom, definitionType, id, outputId]);

        let contents = children;
        const [handleColor] = getTypeAccentColors(definitionType, isDarkMode);
        const connectedColor = useColorModeValue('#EDF2F7', '#171923');
        if (hasHandle) {
            contents = (
                <HStack h="full">
                    {children}
                    <Center
                        position="absolute"
                        right="-6px"
                    >
                        <Div
                            _before={{
                                content: '" "',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                height: '45px',
                                width: '45px',
                                cursor: 'crosshair',
                                transform: 'translate(-50%, -50%)',
                                borderRadius: '100%',
                            }}
                            _hover={{
                                width: '22px',
                                height: '22px',
                                marginRight: '-3px',
                                opacity: showHandle ? 1 : 0,
                            }}
                            as={RightHandle}
                            className="output-handle"
                            id={`${id}-${outputId}`}
                            isValidConnection={isValidConnection}
                            sx={{
                                width: '16px',
                                height: '16px',
                                borderWidth: '2px',
                                borderColor: handleColor,
                                transition: '0.15s ease-in-out',
                                background: isConnected ? connectedColor : handleColor,
                                boxShadow: '-2px 2px 2px #00000014',
                                filter: showHandle ? undefined : 'grayscale(100%)',
                                opacity: showHandle ? 1 : 0.3,
                                position: 'relative',
                            }}
                            onContextMenu={noContextMenu}
                        />
                    </Center>
                </HStack>
            );
        }

        const bgColor = useColorModeValue('gray.300', 'gray.700');

        return (
            <Box
                bg={bgColor}
                h="auto"
                minH="2rem"
                px={2}
                verticalAlign="middle"
                w="full"
            >
                {!generic && (
                    <Center
                        h="1.25rem"
                        p={1}
                        verticalAlign="middle"
                    >
                        {type && (
                            <Center
                                h="2rem"
                                mr={1}
                                verticalAlign="middle"
                            >
                                <TypeTag type={type} />
                            </Center>
                        )}
                        <Text
                            display={label ? 'block' : 'none'}
                            fontSize="xs"
                            lineHeight="0.9rem"
                            textAlign="center"
                        >
                            {label}
                        </Text>
                    </Center>
                )}
                <Box pb={generic ? 0 : 2}>{contents}</Box>
            </Box>
        );
    }
);
