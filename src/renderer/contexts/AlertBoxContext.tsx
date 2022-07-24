import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogCloseButton,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    Button,
    HStack,
    UseToastOptions,
    useDisclosure,
    useToast,
} from '@chakra-ui/react';
import { app, clipboard } from 'electron';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContext, useContext } from 'use-context-selector';
import { ipcRenderer } from '../../common/safeIpc';
import { assertNever, noop } from '../../common/util';
import { useMemoObject } from '../hooks/useMemo';
import { ContextMenuContext } from './ContextMenuContext';

interface AlertBox {
    sendToast: (options: UseToastOptions) => void;
    sendAlert: ((alertType: AlertType, title: string | null, message: string) => void) &
        ((message: AlertOptions) => void);
    showAlert: (message: AlertOptions) => Promise<number>;
}

export enum AlertType {
    INFO = 'Info',
    WARN = 'Warning',
    ERROR = 'Error',
    CRIT_ERROR = 'Critical Error',
}

export interface AlertOptions {
    type: AlertType;
    title?: string;
    message: string;
    copyToClipboard?: boolean;
    buttons?: string[];
    defaultButton?: number;
}

interface InternalMessage extends AlertOptions {
    title: string;
    resolve: (button: number) => void;
}

const EMPTY_MESSAGE: InternalMessage = {
    type: AlertType.INFO,
    title: '',
    message: '',
    resolve: noop,
};

const getButtons = (
    { type, message, copyToClipboard, buttons, defaultButton = 0 }: InternalMessage,
    onClose: (button: number) => void,
    cancelRef: React.Ref<HTMLButtonElement>
): JSX.Element => {
    const buttonElements: JSX.Element[] = [];

    // eslint-disable-next-line no-param-reassign
    copyToClipboard ??= type === AlertType.ERROR;
    if (copyToClipboard) {
        buttonElements.push(
            <Button
                key="copy-to-clipboard"
                onClick={() => clipboard.writeText(message)}
            >
                Copy to Clipboard
            </Button>
        );
    }

    if (buttons && buttons.length) {
        if (
            !Number.isInteger(defaultButton) ||
            defaultButton < 0 ||
            defaultButton >= buttons.length
        ) {
            // eslint-disable-next-line no-param-reassign
            defaultButton = 0;
        }

        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];

            buttonElements.push(
                <Button
                    key={i}
                    ref={i === defaultButton ? cancelRef : undefined}
                    onClick={() => onClose(i)}
                >
                    {button}
                </Button>
            );
        }
    } else {
        switch (type) {
            case AlertType.INFO:
            case AlertType.WARN:
            case AlertType.ERROR:
                buttonElements.push(
                    <Button
                        key="ok"
                        ref={cancelRef}
                        onClick={() => onClose(0)}
                    >
                        OK
                    </Button>
                );
                break;
            case AlertType.CRIT_ERROR:
                buttonElements.push(
                    <Button
                        colorScheme="red"
                        key="exit"
                        ml={3}
                        ref={cancelRef}
                        onClick={() => {
                            window.close();
                            app.quit();
                        }}
                    >
                        Exit Application
                    </Button>
                );
                break;
            default:
                return assertNever(type);
        }
    }
    // eslint-disable-next-line react/jsx-no-useless-fragment
    return <>{buttonElements}</>;
};

export const AlertBoxContext = createContext<Readonly<AlertBox>>({} as AlertBox);

export const AlertBoxProvider = memo(({ children }: React.PropsWithChildren<unknown>) => {
    const { closeContextMenu } = useContext(ContextMenuContext);

    const [queue, setQueue] = useState<readonly InternalMessage[]>([]);
    const current = queue[0] as InternalMessage | undefined;
    const isLast = queue.length < 2;

    const push = useCallback(
        (message: InternalMessage) => setQueue((q) => [...q, message]),
        [setQueue]
    );
    const showAlert = useCallback(
        (message: AlertOptions) => {
            closeContextMenu();
            return new Promise<number>((resolve) => {
                push({ ...message, title: message.title ?? message.type, resolve });
            });
        },
        [push, closeContextMenu]
    );
    const sendAlert = useCallback<AlertBox['sendAlert']>(
        (type: AlertType | AlertOptions, title?: string | null, message?: string) => {
            ipcRenderer.send('disable-menu');
            if (typeof type === 'object') {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                showAlert(type);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                showAlert({ type, title: title ?? undefined, message: message! });
            }
        },
        [showAlert]
    );

    const { isOpen, onOpen, onClose: onDisclosureClose } = useDisclosure();
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (current && !isOpen) {
            onOpen();
        }
    }, [current, isOpen, onOpen]);

    const onClose = useCallback(
        (button: number) => {
            current?.resolve(button);
            setQueue((q) => q.slice(1));
            if (isLast) {
                onDisclosureClose();
                ipcRenderer.send('enable-menu');
            }
        },
        [current, isLast, setQueue, onDisclosureClose]
    );

    const buttons = useMemo(() => {
        return getButtons(current ?? EMPTY_MESSAGE, onClose, cancelRef);
    }, [current, cancelRef, onClose]);

    const toast = useToast();
    const sendToast = useCallback(
        (options: UseToastOptions) => {
            // eslint-disable-next-line no-param-reassign
            options.position ??= 'bottom-right';
            // eslint-disable-next-line no-param-reassign
            options.isClosable ??= true;
            if (options.id !== undefined && toast.isActive(options.id)) {
                toast.update(options.id, options);
                return;
            }
            toast(options);
        },
        [toast]
    );

    const value = useMemoObject<AlertBox>({ sendAlert, showAlert, sendToast });

    return (
        <AlertBoxContext.Provider value={value}>
            <AlertDialog
                isCentered
                isOpen={isOpen}
                leastDestructiveRef={cancelRef}
                scrollBehavior="inside"
                onClose={() => cancelRef.current?.click()}
            >
                <AlertDialogOverlay />

                <AlertDialogContent>
                    <AlertDialogHeader>{current?.title}</AlertDialogHeader>
                    <AlertDialogCloseButton />
                    <AlertDialogBody whiteSpace="pre-wrap">{current?.message}</AlertDialogBody>
                    <AlertDialogFooter>
                        <HStack>{buttons}</HStack>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {children}
        </AlertBoxContext.Provider>
    );
});
