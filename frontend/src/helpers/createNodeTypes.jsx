/* eslint-disable import/extensions */
/* eslint-disable import/prefer-default-export */
/* eslint-disable react/prop-types */
import { CheckCircleIcon, UnlockIcon } from '@chakra-ui/icons';
import {
  Center, Flex, Heading, HStack, Icon, Spacer, Text, useColorModeValue, VStack,
} from '@chakra-ui/react';
import React from 'react';
import { MdMoreHoriz } from 'react-icons/md';
import { IconFactory } from '../components/CustomIcons.jsx';
import GenericInput from '../components/inputs/GenericInput.jsx';
import ImageFileInput from '../components/inputs/ImageFileInput.jsx';
import PthFileInput from '../components/inputs/PthFileInput.jsx';
import GenericOutput from '../components/outputs/GenericOutput.jsx';
import ImageOutput from '../components/outputs/ImageOutput.jsx';
import getAccentColor from './getNodeAccentColors.js';

export const createUsableInputs = (category, node) => (
  node.inputs.map((input, i) => {
    switch (input.type) {
      case 'file::image':
        return (
          <ImageFileInput key={i} extensions={input.filetypes} />
        );
      case 'file::pth':
        return (
          <PthFileInput key={i} extensions={input.filetypes} />
        );
      default:
        return (
          <GenericInput key={i} label={input.label} />
        );
    }
  })
);

export const createRepresentativeInputs = (category, node) => (
  node.inputs.map((input, i) => (
    <GenericInput key={i} label={input.label} hasHandle={false} />
  ))
);

export const createUsableOutputs = (category, node) => (
  node.outputs.map((output, i) => {
    switch (output.type) {
      case 'numpy::2d':
        return (
          <ImageOutput key={i} path="C:/Users/Joey/Desktop/discord alt REWRITTEN OMG 2.png" />
        );
      default:
        return (
          <GenericOutput key={i} label={output.label} />
        );
    }
  })
);

export const createRepresentativeOutputs = (category, node) => (
  node.outputs.map((output, i) => (
    <GenericOutput key={i} label={output.label} hasHandle={false} />
  ))
);

const BottomArea = () => (
  <Flex w="full" pl={2} pr={2}>
    <Center>
      <Icon as={UnlockIcon} mt={-1} mb={-1} color={useColorModeValue('gray.300', 'gray.800')} onClick={() => {}} cursor="pointer" />
    </Center>
    <Spacer />
    <Center>
      <Icon as={CheckCircleIcon} mt={-1} mb={-1} color={useColorModeValue('gray.300', 'gray.800')} onClick={() => {}} cursor="pointer" />
    </Center>
    <Spacer />
    <Center>
      <Icon as={MdMoreHoriz} w={6} h={6} mt={-4} mb={-4} color={useColorModeValue('gray.300', 'gray.800')} onClick={() => {}} cursor="pointer" />
    </Center>
  </Flex>
);

const NodeHeader = ({ category, node, width }) => (
  <Center
    w={width || 'full'}
    h="auto"
    borderBottomColor={getAccentColor(category)}
    borderBottomWidth="4px"
  >
    <HStack
      pl={6}
      pr={6}
      pb={2}
    >
      <Center>
        {IconFactory(category)}
      </Center>
      <Center>
        <Heading as="h5" size="sm" m={0} p={0} fontWeight={700}>
          {node.name.toUpperCase()}
        </Heading>
      </Center>
    </HStack>
  </Center>
);

const NodeWrapper = ({ children }) => (
  <Center
    bg={useColorModeValue('gray.50', 'gray.700')}
    borderWidth="1px"
    borderRadius="lg"
    py={2}
    boxShadow="lg"
    _hover={{ boxShadow: 'rgba(0, 0, 0, 0.40) 0px 14px 18px -3px', transition: '0.15s ease-in-out', transform: 'translate(-1px, -1px)' }}
    _active={{ boxShadow: 'rgba(0, 0, 0, 0.40) 0px 14px 18px -3px', transition: '0.15s ease-in-out', transform: 'translate(-1px, -1px)' }}
    transition="0.2s ease-in-out"
    onDragCapture={(e) => e.stopPropagation()}
    onDrag={(e) => e.stopPropagation()}
  >
    { children }
  </Center>
);

export const createUsableNode = (category, node) => (
  <NodeWrapper>
    <VStack>
      <NodeHeader category={category} node={node} />

      <Text fontSize="xs" p={0} m={0}>
        INPUTS
      </Text>
      {createUsableInputs(category, node)}

      <Text fontSize="xs" p={0} m={0}>
        OUTPUTS
      </Text>
      {createUsableOutputs(category, node)}

      <BottomArea />
    </VStack>
  </NodeWrapper>
);

export const createRepresentativeNode = (category, node) => (
  <NodeWrapper>
    <VStack>
      <NodeHeader category={category} node={node} width="220px" />

      {/* <Text fontSize="xs" p={0} m={0}>
        INPUTS
      </Text>
      {createRepresentativeInputs(category, node)}

      <Text fontSize="xs" p={0} m={0}>
        OUTPUTS
      </Text>
      {createRepresentativeOutputs(category, node)} */}
    </VStack>
  </NodeWrapper>
);

export const createNodeTypes = (data) => {
  console.log(data);
  const nodesList = {};
  if (data) {
    data.forEach(({ category, nodes }) => {
      nodes.forEach((node) => {
        const newNode = () => (
          createUsableNode(category, node)
        );
        nodesList[node.name] = newNode;
        console.log('nodes list', nodesList);
      });
    });
  }
  return nodesList;
};

export const createRepresentativeNodeTypes = (data) => {
  console.log(data);
  const nodesList = {};
  if (data) {
    data.forEach(({ category, nodes }) => {
      nodes.forEach((node) => {
        const newNode = () => (
          createRepresentativeNode(category, node)
        );
        nodesList[node.name] = newNode;
        console.log('nodes list', nodesList);
      });
    });
  }
  return nodesList;
};
