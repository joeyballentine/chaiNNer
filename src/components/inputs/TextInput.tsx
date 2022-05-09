import { Input } from '@chakra-ui/react';
import { ChangeEvent, memo, useContext, useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { GlobalContext } from '../../helpers/contexts/GlobalNodeState';

interface TextInputProps {
    id: string;
    index: number;
    isLocked?: boolean;
    label: string;
    maxLength?: number;
}

const TextInput = memo(({ label, id, index, isLocked, maxLength }: TextInputProps) => {
    const { useInputData, isNodeInputLocked } = useContext(GlobalContext);
    const [input, setInput] = useInputData<string>(id, index);
    const [tempText, setTempText] = useState('');
    const isInputLocked = isNodeInputLocked(id, index);

    useEffect(() => {
        if (!input) {
            setInput('');
        } else {
            setTempText(input);
        }
    }, []);

    const handleChange = useDebouncedCallback((event: ChangeEvent<HTMLInputElement>) => {
        let text = event.target.value;
        text = maxLength ? text.slice(0, maxLength) : text;
        setInput(text);
    }, 500);

    return (
        <Input
            className="nodrag"
            disabled={isLocked || isInputLocked}
            draggable={false}
            maxLength={maxLength}
            placeholder={label}
            value={tempText}
            onChange={(event) => {
                setTempText(event.target.value);
                handleChange(event);
            }}
        />
    );
});

export default TextInput;
