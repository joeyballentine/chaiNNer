import { Box, HStack, Text, chakra, useColorModeValue } from '@chakra-ui/react';
import React, { memo } from 'react';
import { Connection, Handle, Position, useEdges } from 'react-flow-renderer';
import { useContext } from 'use-context-selector';
import { EdgeData } from '../../../common/common-types';
import { parseHandle } from '../../../common/util';
import { GlobalContext } from '../../contexts/GlobalNodeState';
import { interpolateColor } from '../../helpers/colorTools';
import getTypeAccentColors from '../../helpers/getTypeAccentColors';
import { noContextMenu } from '../../hooks/useContextMenu';

interface InputContainerProps {
    id: string;
    inputId: number;
    label?: string;
    hasHandle: boolean;
    accentColor: string;
    type: string;
}

interface LeftHandleProps {
    isValidConnection: (connection: Readonly<Connection>) => boolean;
    id: string;
    inputId: number;
}

// Had to do this garbage to prevent chakra from clashing the position prop
const LeftHandle = memo(
    ({
        children,
        isValidConnection,
        id,
        inputId,
        ...props
    }: React.PropsWithChildren<LeftHandleProps>) => (
        <Handle
            isConnectable
            className="input-handle"
            id={`${id}-${inputId}`}
            isValidConnection={isValidConnection}
            position={Position.Left}
            type="target"
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

const InputContainer = memo(
    ({
        children,
        hasHandle,
        id,
        inputId,
        label,
        accentColor,
        type,
    }: React.PropsWithChildren<InputContainerProps>) => {
        const { isValidConnection } = useContext(GlobalContext);
        const edges = useEdges<EdgeData>();
        const isConnected = !!edges.find(
            (e) => e.target === id && parseHandle(e.targetHandle!).inOutId === inputId
        );

        let contents = children;
        if (hasHandle) {
            const handleColor = getTypeAccentColors(type); // useColorModeValue('#EDF2F7', '#171923');
            const borderColor = useColorModeValue('#171923', '#F7FAFC'); // shadeColor(handleColor, 25); // useColorModeValue('#171923', '#F7FAFC');
            const connectedColor = useColorModeValue('#EDF2F7', '#171923');
            contents = (
                <HStack
                    h="full"
                    sx={{
                        '.react-flow__handle-connecting': {
                            background: '#E53E3E !important',
                        },
                        '.react-flow__handle-valid': {
                            background: '#38A169 !important',
                        },
                    }}
                >
                    <div style={{ position: 'absolute', left: '-4px', width: 0 }}>
                        <Div
                            _before={{
                                content: '" "',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                height: '35px',
                                width: '35px',
                                cursor: 'crosshair',
                                // backgroundColor: '#FF00FF1F',
                                transform: 'translate(-50%, -50%)',
                                borderRadius: '100%',
                            }}
                            _hover={{
                                width: '22px',
                                height: '22px',
                                marginLeft: '-3px',
                            }}
                            as={LeftHandle}
                            className="input-handle"
                            id={id}
                            inputId={inputId}
                            isValidConnection={isValidConnection}
                            sx={{
                                width: '16px',
                                height: '16px',
                                borderWidth: '2px',
                                borderColor: handleColor,
                                transition: '0.15s ease-in-out',
                                background: isConnected ? connectedColor : handleColor,
                                boxShadow: '2px 2px 2px #00000014',
                            }}
                            onContextMenu={noContextMenu}
                        />
                    </div>
                    {children}
                </HStack>
            );
        }

        const bgColor = useColorModeValue('#EDF2F7', '#4A5568');

        return (
            <Box
                // bg={useColorModeValue('gray.100', 'gray.600')}
                bg={interpolateColor(accentColor, bgColor, 0.975)}
                p={2}
                w="full"
            >
                <Text
                    display={label ? 'block' : 'none'}
                    fontSize="xs"
                    mt={-1}
                    p={1}
                    pt={-1}
                    textAlign="center"
                >
                    {label}
                </Text>
                {contents}
            </Box>
        );
    }
);

export default InputContainer;
