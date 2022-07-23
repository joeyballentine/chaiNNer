import { Center, Flex, Icon, Spacer, Text, useColorModeValue } from '@chakra-ui/react';
import { memo } from 'react';
import { useReactFlow } from 'react-flow-renderer';
import { BsEyeFill } from 'react-icons/bs';
import { useContextSelector } from 'use-context-selector';
import { SchemaId } from '../../../common/common-types';
import { createUniqueId } from '../../../common/util';
import { GlobalVolatileContext } from '../../contexts/GlobalNodeState';
import { TypeTag } from '../TypeTag';
import { OutputProps } from './props';

export const DefaultImageOutput = memo(({ label, id, outputId }: OutputProps) => {
    const type = useContextSelector(GlobalVolatileContext, (c) =>
        c.typeState.functions.get(id)?.outputs.get(outputId)
    );

    const createNode = useContextSelector(GlobalVolatileContext, (c) => c.createNode);
    const createConnection = useContextSelector(GlobalVolatileContext, (c) => c.createConnection);

    const imgBgColor = useColorModeValue('gray.400', 'gray.750');
    const eyeIconColor = useColorModeValue('gray.700', 'gray.400');

    const { getNode } = useReactFlow();

    return (
        <Flex
            h="full"
            minH="2rem"
            verticalAlign="middle"
            w="full"
        >
            <Center
                cursor="zoom-in"
                h="2rem"
                w="2rem"
                onClick={() => {
                    const containingNode = getNode(id);
                    if (containingNode) {
                        const nodeId = createUniqueId();
                        // TODO: This is a bit of hardcoding, but it works
                        createNode({
                            id: nodeId,
                            position: {
                                x: containingNode.position.x + (containingNode.width ?? 0) + 75,
                                y: containingNode.position.y,
                            },
                            data: {
                                schemaId: 'chainner:image:view' as SchemaId,
                            },
                            nodeType: 'regularNode',
                        });
                        createConnection({
                            source: id,
                            sourceHandle: `${id}-${outputId}`,
                            target: nodeId,
                            targetHandle: `${nodeId}-${0}`,
                        });
                    }
                }}
            >
                <Center
                    bgColor={imgBgColor}
                    borderRadius="md"
                    cursor="zoom-in"
                    h="1.75rem"
                    maxH="1.75rem"
                    maxW="1.75rem"
                    minH="1.75rem"
                    minW="1.75rem"
                    overflow="hidden"
                    w="1.75rem"
                >
                    <Icon
                        as={BsEyeFill}
                        color={eyeIconColor}
                    />
                </Center>
            </Center>
            <Spacer />
            {type && (
                <Center
                    h="2rem"
                    verticalAlign="middle"
                >
                    <TypeTag type={type} />
                </Center>
            )}
            <Text
                h="full"
                lineHeight="2rem"
                marginInlineEnd="0.5rem"
                ml={1}
                textAlign="right"
            >
                {label}
            </Text>
        </Flex>
    );
});
