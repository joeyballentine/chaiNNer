/* eslint-disable import/extensions */
/* eslint-disable import/prefer-default-export */
/* eslint-disable react/prop-types */
import {
  CheckCircleIcon, CopyIcon, DeleteIcon, UnlockIcon,
} from '@chakra-ui/icons';
import {
  Center, Flex, Heading, HStack, Icon, Menu, MenuButton, MenuItem,
  MenuList, Portal, Spacer, Text, Tooltip, useColorModeValue, VStack,
} from '@chakra-ui/react';
import React, { memo, useState } from 'react';
import { MdMoreHoriz } from 'react-icons/md';
import { IconFactory } from '../components/CustomIcons.jsx';
import DirectoryInput from '../components/inputs/DirectoryInput.jsx';
import DropDownInput from '../components/inputs/DropDownInput.jsx';
import FileInput from '../components/inputs/FileInput.jsx';
import GenericInput from '../components/inputs/GenericInput.jsx';
import TextInput from '../components/inputs/TextInput.jsx';
import GenericOutput from '../components/outputs/GenericOutput.jsx';
import ImageOutput from '../components/outputs/ImageOutput.jsx';
import getAccentColor from './getNodeAccentColors.js';

export const CreateUsableInputs = memo(({ data }) => data.inputs.map((input, i) => {
  switch (input.type) {
    case 'file::image':
      return (
        <FileInput
          key={i}
          index={i}
          extensions={input.filetypes}
          data={data}
          label={input.label}
        />
      );
    case 'file::pth':
      return (
        <FileInput key={i} index={i} extensions={input.filetypes} data={data} label={input.label} />
      );
    case 'file::directory':
      return (
        <DirectoryInput key={i} index={i} data={data} label={input.label} />
      );
    case 'text::any':
      return (
        <TextInput key={i} index={i} data={data} label={input.label} />
      );
    case 'dropdown::image-extensions':
      return (
        <DropDownInput key={i} index={i} data={data} label={input.label} options={input.options} />
      );
    default:
      return (
        <GenericInput key={i} index={i} label={input.label} data={data} />
      );
  }
}));

export const createRepresentativeInputs = (category, node) => (
  node.inputs.map((input, i) => (
    <GenericInput key={i} label={input.label} hasHandle={false} />
  ))
);

export const CreateUsableOutputs = memo(({ data }) => data.outputs.map((output, i) => {
  switch (output.type) {
    case 'numpy::2d':
      return (
        <ImageOutput key={i} index={i} data={data} label={output.label} />
      );
    default:
      return (
        <GenericOutput key={i} index={i} label={output.label} data={data} />
      );
  }
}));

export const createRepresentativeOutputs = (category, node) => (
  node.outputs.map((output, i) => (
    <GenericOutput key={i} label={output.label} hasHandle={false} />
  ))
);

const BottomArea = memo(() => (
  <Flex w="full" pl={2} pr={2}>
    <Center>
      <Icon as={UnlockIcon} mt={-1} mb={-1} color={useColorModeValue('gray.300', 'gray.800')} onClick={() => {}} cursor="pointer" />
    </Center>
    <Spacer />
    <Tooltip label="Node Valid" closeOnClick={false} hasArrow gutter={24}>
      <Center>
        <Icon as={CheckCircleIcon} mt={-1} mb={-1} color={useColorModeValue('gray.300', 'gray.800')} cursor="pointer" />
      </Center>
    </Tooltip>
    <Spacer />
    <Center>
      <Menu>
        <MenuButton as={Center} mt={-4} mb={-4} cursor="pointer">
          <Icon as={MdMoreHoriz} w={6} h={6} mt={-1} color={useColorModeValue('gray.300', 'gray.800')} onClick={() => {}} />
        </MenuButton>
        <Portal>
          <MenuList>
            <MenuItem icon={<CopyIcon />}>Duplicate</MenuItem>
            <MenuItem icon={<DeleteIcon />}>Delete</MenuItem>
          </MenuList>
        </Portal>
      </Menu>
    </Center>

  </Flex>
));

const NodeHeader = memo(({ data, width }) => {
  const { category, type } = data;
  return (
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
            {type.toUpperCase()}
          </Heading>
        </Center>
      </HStack>
    </Center>
  );
});

const NodeWrapper = memo(({ children }) => {
  const [isDragging, setIsDragging] = useState(false);
  // console.log(isDragging);
  return (
    <Center
      bg={useColorModeValue('gray.50', 'gray.700')}
      borderWidth="1px"
      borderRadius="lg"
      py={2}
      boxShadow="lg"
      // _hover={{ boxShadow: 'rgba(0, 0, 0, 0.40) 0px 0px 13px -3px', transform: 'translate(-1px, -1px)' }}
      // _active={{ boxShadow: 'rgba(0, 0, 0, 0.50) 0px 14px 18px -3px', transform: 'translate(-2px, -2px)' }}
      transition="0.2s ease-in-out"
      // onDragCapture={() => setIsDragging(true)}
      // onDrag={() => setIsDragging(true)}
      // onDragStart={() => setIsDragging(true)}
      // onDragStartCapture={() => setIsDragging(true)}
      // onDragEndCapture={() => setIsDragging(false)}
      // onDragEnter={() => setIsDragging(false)}
    >
      { children }
    </Center>
  );
});

function UsableNode({ data }) {
  return (
    <NodeWrapper>
      <VStack>
        <NodeHeader data={data} />

        {data.inputs.length && (
          <Center>
            <Text fontSize="xs" p={0} m={0} mt={-1} mb={-1} pt={-1} pb={-1}>
              INPUTS
            </Text>
          </Center>
        )}
        <CreateUsableInputs data={data} />

        {data.outputs.length && (
          <Center>
            <Text fontSize="xs" p={0} m={0} mt={-1} mb={-1} pt={-1} pb={-1}>
              OUTPUTS
            </Text>
          </Center>
        )}
        <CreateUsableOutputs data={data} />

        <BottomArea />
      </VStack>
    </NodeWrapper>
  );
}

// export const createUsableNode = (category, node) => {
//   const id = createUniqueId();
//   return (
//     <NodeWrapper>
//       <VStack>
//         <NodeHeader category={category} node={node} />

//         <Text fontSize="xs" p={0} m={0}>
//           INPUTS
//         </Text>
//         {createUsableInputs(category, node, id)}

//         <Text fontSize="xs" p={0} m={0}>
//           OUTPUTS
//         </Text>
//         {createUsableOutputs(category, node, id)}

//         <BottomArea />
//       </VStack>
//     </NodeWrapper>
//   );
// };

// function RepresentativeNode({ data }) {
//   return (
//     <NodeWrapper>
//       <VStack>
//         <NodeHeader data={data} width="220px" />
//       </VStack>
//     </NodeWrapper>
//   );
// }

export const createRepresentativeNode = (category, node) => (
  <NodeWrapper>
    <VStack>
      <NodeHeader data={{ category, type: node.name }} width="220px" />
    </VStack>
  </NodeWrapper>
);

export const createNodeTypes = (data) => {
  const nodesList = {};
  if (data) {
    data.forEach(({ category, nodes }) => {
      nodes.forEach((node) => {
        nodesList[node.name] = memo(UsableNode);
      });
    });
  }
  return nodesList;
};

export const createRepresentativeNodeTypes = (data) => {
  const nodesList = {};
  if (data) {
    data.forEach(({ category, nodes }) => {
      nodes.forEach((node) => {
        const newNode = () => (
          createRepresentativeNode(category, node)
        );
        nodesList[node.name] = newNode;
      });
    });
  }
  return nodesList;
};
