import { DeleteIcon, DownloadIcon } from '@chakra-ui/icons';
import {
    Accordion,
    AccordionButton,
    AccordionIcon,
    AccordionItem,
    AccordionPanel,
    Box,
    Button,
    Center,
    Flex,
    HStack,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    Progress,
    Spinner,
    StackDivider,
    Text,
    Textarea,
    VStack,
    useColorModeValue,
    useDisclosure,
} from '@chakra-ui/react';
import log from 'electron-log';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import semver from 'semver';
import { createContext, useContext } from 'use-context-selector';
import { PythonInfo } from '../../common/common-types';
import { Dependency, getOptionalDependencies } from '../../common/dependencies';
import { OnStdio, PipList, runPipInstall, runPipList, runPipUninstall } from '../../common/pip';
import { getPythonInfo } from '../../common/python';
import { ipcRenderer } from '../../common/safeIpc';
import { noop } from '../../common/util';
import { useAsyncEffect } from '../hooks/useAsyncEffect';
import { useMemoObject } from '../hooks/useMemo';
import { AlertBoxContext, AlertType } from './AlertBoxContext';
import { ExecutionContext } from './ExecutionContext';
import { SettingsContext } from './SettingsContext';

export interface DependencyContextValue {
    openDependencyManager: () => void;
    availableUpdates: number;
}

export const DependencyContext = createContext<Readonly<DependencyContextValue>>({
    openDependencyManager: noop,
    availableUpdates: 0,
});

const checkSemver = (v1: string, v2: string) => {
    try {
        return !semver.gt(semver.coerce(v1)!.version, semver.coerce(v2)!.version);
    } catch (error) {
        log.error(error);
        return true;
    }
};

export const DependencyProvider = memo(({ children }: React.PropsWithChildren<unknown>) => {
    const { isOpen, onOpen, onClose } = useDisclosure();

    const { showAlert } = useContext(AlertBoxContext);
    const { setIsBackendKilled } = useContext(ExecutionContext);
    const { useIsSystemPython } = useContext(SettingsContext);

    const [isSystemPython] = useIsSystemPython;

    const [pythonInfo, setPythonInfo] = useState<PythonInfo>();
    const [pipList, setPipList] = useState<PipList>();
    const refreshInstalledPackages = useCallback(() => setPipList(undefined), [setPipList]);

    useAsyncEffect(
        {
            supplier: getPythonInfo,
            successEffect: setPythonInfo,
        },
        [setPythonInfo]
    );
    useAsyncEffect(
        {
            supplier: async () => {
                if (pipList) return undefined;
                return runPipList();
            },
            successEffect: (list) => {
                if (list) {
                    setPipList(list);
                }
            },
        },
        [pipList, setPipList]
    );

    type GpuInfo = { isNvidia: true; nvidiaGpu: string } | { isNvidia: false; gpuNames: string[] };
    const [gpu, setGpu] = useState<GpuInfo>({ isNvidia: false, gpuNames: [] });
    useAsyncEffect(
        {
            supplier: async (): Promise<GpuInfo> => {
                const nvidiaGpu = await ipcRenderer.invoke('get-nvidia-gpu-name');
                if (nvidiaGpu) {
                    return { isNvidia: true, nvidiaGpu };
                }

                const fullGpuInfo = await ipcRenderer.invoke('get-gpu-info');
                const gpuNames = fullGpuInfo.controllers.map((g) => g.model);
                return { isNvidia: false, gpuNames };
            },
            successEffect: setGpu,
        },
        []
    );

    const [availableDeps, setAvailableDeps] = useState<Dependency[]>([]);
    useAsyncEffect(
        {
            supplier: async () => {
                const nvidiaGpu = await ipcRenderer.invoke('get-nvidia-gpu-name');
                const isNvidiaAvailable = nvidiaGpu !== null;
                return getOptionalDependencies(isNvidiaAvailable);
            },
            successEffect: setAvailableDeps,
        },
        []
    );

    const [installingPackage, setInstallingPackage] = useState<Dependency | null>(null);
    const [uninstallingPackage, setUninstallingPackage] = useState<Dependency | null>(null);

    const consoleRef = useRef<HTMLTextAreaElement | null>(null);
    const [shellOutput, setShellOutput] = useState('');
    const [isRunningShell, setIsRunningShell] = useState(false);
    const [progress, setProgress] = useState(0);
    const appendToOutput = useCallback(
        (data: string) => {
            setShellOutput((prev) => (prev + data).slice(-10_000));
        },
        [setShellOutput]
    );
    const onStdio: OnStdio = { onStderr: appendToOutput, onStdout: appendToOutput };

    const [depChanged, setDepChanged] = useState(false);
    useAsyncEffect(async () => {
        if (depChanged) {
            setIsBackendKilled(true);
            await ipcRenderer.invoke('kill-backend');
        }
    }, [depChanged]);

    const changePackages = (supplier: () => Promise<void>) => {
        if (isRunningShell) throw new Error('Cannot run two pip commands at once');

        setShellOutput('');
        setIsRunningShell(true);
        setProgress(0);
        setDepChanged(true);

        supplier()
            .catch((error) => {
                appendToOutput(`${String(error)}\n`);
            })
            .finally(() => {
                setIsRunningShell(false);
                refreshInstalledPackages();
                setInstallingPackage(null);
                setUninstallingPackage(null);
                setProgress(0);
            });
    };

    const installPackage = (dep: Dependency) => {
        setInstallingPackage(dep);
        changePackages(() => runPipInstall([dep], setProgress, onStdio));
    };

    const uninstallPackage = (dep: Dependency) => {
        setUninstallingPackage(dep);
        changePackages(() => runPipUninstall([dep], setProgress, onStdio));
    };

    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [shellOutput]);

    const availableUpdates = useMemo(() => {
        return availableDeps.filter(({ packages }) =>
            packages.some(({ packageName, version }) => {
                if (!pipList) {
                    return false;
                }
                if (!pipList[packageName]) {
                    return true;
                }
                return !checkSemver(version, pipList[packageName]);
            })
        ).length;
    }, [pipList, availableDeps]);

    const value = useMemoObject<DependencyContextValue>({
        openDependencyManager: onOpen,
        availableUpdates,
    });

    return (
        <DependencyContext.Provider value={value}>
            {children}
            <Modal
                isCentered
                closeOnOverlayClick={!depChanged}
                isOpen={isOpen}
                returnFocusOnClose={false}
                scrollBehavior="inside"
                size="xl"
                onClose={onClose}
            >
                <ModalOverlay cursor={depChanged ? 'disabled' : 'default'} />
                <ModalContent maxW="750px">
                    <ModalHeader>Dependency Manager</ModalHeader>
                    <ModalCloseButton disabled={depChanged} />
                    <ModalBody>
                        <VStack
                            divider={<StackDivider />}
                            w="full"
                        >
                            <VStack
                                divider={<StackDivider />}
                                w="full"
                            >
                                <Flex
                                    align="center"
                                    w="full"
                                >
                                    <Text
                                        flex="1"
                                        textAlign="left"
                                    >
                                        GPU (
                                        {gpu.isNvidia
                                            ? gpu.nvidiaGpu
                                            : gpu.gpuNames[0] ?? 'No GPU available'}
                                        )
                                    </Text>
                                </Flex>
                                <Flex
                                    align="center"
                                    w="full"
                                >
                                    <Text
                                        flex="1"
                                        textAlign="left"
                                    >
                                        Python ({pythonInfo?.version}) [
                                        {isSystemPython ? 'System' : 'Integrated'}]
                                    </Text>
                                </Flex>
                                {!pipList ? (
                                    <Spinner />
                                ) : (
                                    availableDeps.map((dep) => {
                                        const allDepPackagesInstalled = dep.packages.every(
                                            (p) => pipList[p.packageName]
                                        );
                                        const allDepPackageVersionsString = dep.packages
                                            .map((p) => pipList[p.packageName])
                                            .join('/');
                                        return (
                                            <VStack
                                                key={dep.name}
                                                w="full"
                                            >
                                                <Flex
                                                    align="center"
                                                    key={dep.name}
                                                    w="full"
                                                >
                                                    {/* <Text>{`Installed version: ${dep.version ?? 'None'}`}</Text> */}
                                                    <Text
                                                        color={
                                                            allDepPackagesInstalled
                                                                ? 'inherit'
                                                                : 'red.500'
                                                        }
                                                        flex="1"
                                                        textAlign="left"
                                                    >
                                                        {`${dep.name} (${
                                                            allDepPackagesInstalled
                                                                ? allDepPackageVersionsString
                                                                : 'not installed'
                                                        })`}
                                                    </Text>
                                                    {dep.packages.length ===
                                                    dep.packages.filter(
                                                        (p) => pipList[p.packageName]
                                                    ).length ? (
                                                        <HStack>
                                                            <Button
                                                                colorScheme="blue"
                                                                disabled={
                                                                    dep.packages.some((p) =>
                                                                        checkSemver(
                                                                            p.version,
                                                                            pipList[p.packageName]
                                                                        )
                                                                    ) || isRunningShell
                                                                }
                                                                isLoading={isRunningShell}
                                                                leftIcon={<DownloadIcon />}
                                                                size="sm"
                                                                onClick={() => installPackage(dep)}
                                                            >
                                                                {`Update${
                                                                    dep.packages.some(
                                                                        (p) =>
                                                                            !checkSemver(
                                                                                p.version,
                                                                                pipList[
                                                                                    p.packageName
                                                                                ]
                                                                            )
                                                                    )
                                                                        ? ` (${allDepPackageVersionsString})`
                                                                        : ''
                                                                }`}
                                                            </Button>
                                                            <Button
                                                                colorScheme="red"
                                                                disabled={isRunningShell}
                                                                leftIcon={<DeleteIcon />}
                                                                size="sm"
                                                                onClick={() => {
                                                                    showAlert({
                                                                        type: AlertType.WARN,
                                                                        title: 'Uninstall',
                                                                        message: `Are you sure you want to uninstall ${dep.name}?`,
                                                                        buttons: [
                                                                            'Cancel',
                                                                            'Uninstall',
                                                                        ],
                                                                        defaultButton: 0,
                                                                    })
                                                                        .then((button) => {
                                                                            if (button === 1) {
                                                                                uninstallPackage(
                                                                                    dep
                                                                                );
                                                                            }
                                                                        })
                                                                        .catch((error) =>
                                                                            log.error(error)
                                                                        );
                                                                }}
                                                            >
                                                                Uninstall
                                                            </Button>
                                                        </HStack>
                                                    ) : (
                                                        <Button
                                                            colorScheme="blue"
                                                            disabled={isRunningShell}
                                                            isLoading={isRunningShell}
                                                            leftIcon={<DownloadIcon />}
                                                            size="sm"
                                                            onClick={() => installPackage(dep)}
                                                        >
                                                            Install
                                                        </Button>
                                                    )}
                                                </Flex>
                                                {isRunningShell &&
                                                    (installingPackage || uninstallingPackage)
                                                        ?.name === dep.name && (
                                                        <Center
                                                            h={8}
                                                            w="full"
                                                        >
                                                            <Progress
                                                                hasStripe
                                                                isAnimated
                                                                value={progress}
                                                                w="full"
                                                            />
                                                        </Center>
                                                    )}
                                            </VStack>
                                        );
                                    })
                                )}
                            </VStack>
                            <Accordion
                                allowToggle
                                w="full"
                            >
                                <AccordionItem>
                                    <h2>
                                        <AccordionButton>
                                            <Box
                                                flex="1"
                                                textAlign="left"
                                            >
                                                Console Output
                                            </Box>
                                            <AccordionIcon />
                                        </AccordionButton>
                                    </h2>
                                    <AccordionPanel pb={4}>
                                        <Textarea
                                            readOnly
                                            cursor="default"
                                            fontFamily="monospace"
                                            h="150"
                                            overflowY="scroll"
                                            placeholder=""
                                            ref={consoleRef}
                                            sx={{
                                                '&::-webkit-scrollbar': {
                                                    width: '8px',
                                                    borderRadius: '8px',
                                                    backgroundColor: 'rgba(0, 0, 0, 0)',
                                                },
                                                '&::-webkit-scrollbar-track': {
                                                    borderRadius: '8px',
                                                    width: '8px',
                                                },
                                                '&::-webkit-scrollbar-thumb': {
                                                    borderRadius: '8px',
                                                    backgroundColor: useColorModeValue(
                                                        'gray.300',
                                                        'gray.600'
                                                    ),
                                                },
                                            }}
                                            value={shellOutput}
                                            w="full"
                                            onChange={(e) => e.preventDefault()}
                                            onClick={(e) => e.preventDefault()}
                                            onFocus={(e) => e.preventDefault()}
                                        />
                                    </AccordionPanel>
                                </AccordionItem>
                            </Accordion>
                        </VStack>
                    </ModalBody>

                    <ModalFooter>
                        <Button
                            colorScheme="blue"
                            disabled={depChanged}
                            mr={3}
                            variant={depChanged ? 'ghost' : 'solid'}
                            onClick={onClose}
                        >
                            Close
                        </Button>
                        <Button
                            colorScheme="blue"
                            variant={depChanged ? 'solid' : 'ghost'}
                            // eslint-disable-next-line @typescript-eslint/no-misused-promises
                            onClick={async () => ipcRenderer.invoke('relaunch-application')}
                        >
                            Restart chaiNNer
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </DependencyContext.Provider>
    );
});
