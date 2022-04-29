import { Box, Text } from '@chakra-ui/react';
import { memo } from 'react';

const GenericInput = memo(({ label }) => (
  // These both need to have -1 margins to thin it out... I don't know why
  <Box
    mb={-1}
    mt={-1}
  >
    <Text
      mb={-1}
      mt={-1}
      textAlign="left"
      w="full"
    >
      {label}
    </Text>
  </Box>
));

export default GenericInput;
