/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { ChildProcessWithoutNullStreams, exec as _exec, spawn } from 'child_process';
import { BrowserWindow, app, dialog, nativeTheme, powerSaveBlocker, shell } from 'electron';
import log from 'electron-log';
import { readdirSync, rmSync } from 'fs';
import { LocalStorage } from 'node-localstorage';
import os from 'os';
import path from 'path';
import portfinder from 'portfinder';
import semver from 'semver';
import util from 'util';
import { PythonInfo, WindowSize } from '../common/common-types';
import { requiredDependencies } from '../common/dependencies';
import { runPipInstall, runPipList } from '../common/pip';
import { getPythonInfo, setPythonInfo } from '../common/python';
import { BrowserWindowWithSafeIpc, ipcMain } from '../common/safeIpc';
import { SaveFile, openSaveFile } from '../common/SaveFile';
import { checkFileExists } from '../common/util';
import { getArguments } from './arguments';
import { setEmptyMenu, setMainMenu } from './menu';
import { createNvidiaSmiVRamChecker, getNvidiaGpuName, getNvidiaSmi } from './nvidiaSmi';
import { downloadPython, extractPython } from './setupIntegratedPython';
import { getGpuInfo } from './systemInfo';
import { hasUpdate } from './update';

const exec = util.promisify(_exec);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line global-require
if (require('electron-squirrel-startup')) {
    app.quit();
}

const localStorageLocation = path.join(app.getPath('userData'), 'settings');
ipcMain.handle('get-localstorage-location', () => localStorageLocation);
const localStorage = new LocalStorage(localStorageLocation);

const lastWindowSize = JSON.parse(
    localStorage.getItem('use-last-window-size') || 'null'
) as WindowSize | null;
const disableHardwareAcceleration = localStorage.getItem('disable-hw-accel') === 'true';
if (disableHardwareAcceleration) {
    app.disableHardwareAcceleration();
}

// log.transports.file.resolvePath = () => path.join(app.getAppPath(), 'logs/main.log');
log.transports.file.resolvePath = (variables) =>
    path.join(variables.electronDefaultDir!, variables.fileName!);
log.transports.file.level = 'info';

log.catchErrors({
    showDialog: false,
    onError: (error, versions, submitIssue) => {
        dialog
            .showMessageBox({
                title: 'An error occurred',
                message: error.message,
                detail: error.stack,
                type: 'error',
                buttons: ['Ignore', 'Report', 'Exit'],
            })
            .then((result) => {
                if (result.response === 1) {
                    submitIssue!('https://github.com/joeyballentine/chaiNNer/issues/new', {
                        title: `Error report for ${String(versions?.app)}`,
                        body: `Error:\n\`\`\`${String(error.stack)}\n\`\`\`\nOS: ${String(
                            versions?.os
                        )}`,
                    });
                    return;
                }

                if (result.response === 2) {
                    app.quit();
                }
            });
    },
});

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// Check for update
if (app.isPackaged) {
    hasUpdate(app.getVersion())
        .then(async (latest) => {
            if (!latest) return;

            const buttonResult = await dialog.showMessageBox(BrowserWindow.getFocusedWindow()!, {
                type: 'info',
                title: 'An update is available for chaiNNer!',
                message: `Version ${latest.version} is available for download from GitHub.`,
                buttons: [`Get version ${latest.version}`, 'Ok'],
                defaultId: 1,
            });
            if (buttonResult.response === 0) {
                await shell.openExternal(latest.releaseUrl);
                app.exit();
            }
        })
        .catch((reason) => log.error(reason));
}

const ownsBackend = !getArguments().noBackend;
ipcMain.handle('owns-backend', () => ownsBackend);

let splash: BrowserWindowWithSafeIpc;
let mainWindow: BrowserWindowWithSafeIpc;

const registerEventHandlers = () => {
    ipcMain.handle('dir-select', (event, dirPath) =>
        dialog.showOpenDialog(mainWindow, {
            defaultPath: dirPath,
            properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
        })
    );

    ipcMain.handle('file-select', (event, filters, allowMultiple = false, dirPath = undefined) =>
        dialog.showOpenDialog(mainWindow, {
            filters,
            defaultPath: dirPath,
            properties: allowMultiple ? ['openFile', 'multiSelections'] : ['openFile'],
        })
    );

    ipcMain.handle('file-save-as-json', async (event, saveData, defaultPath) => {
        try {
            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Chain File',
                filters: [{ name: 'Chain File', extensions: ['chn'] }],
                defaultPath,
            });
            if (!canceled && filePath) {
                await SaveFile.write(filePath, saveData, app.getVersion());
                return { kind: 'Success', path: filePath };
            }
            return { kind: 'Canceled' };
        } catch (error) {
            log.error(error);
            throw error;
        }
    });

    ipcMain.handle('file-save-json', async (event, saveData, savePath) => {
        try {
            await SaveFile.write(savePath, saveData, app.getVersion());
        } catch (error) {
            log.error(error);
            throw error;
        }
    });

    ipcMain.handle('quit-application', () => {
        app.exit();
    });

    // ipcMain.handle('relaunch-application', async () => {
    //   app.relaunch();
    //   app.exit();
    // });

    ipcMain.handle('get-gpu-info', getGpuInfo);

    ipcMain.handle('get-app-version', () => app.getVersion());

    let blockerId: number | undefined;
    ipcMain.on('start-sleep-blocker', () => {
        if (blockerId === undefined) {
            blockerId = powerSaveBlocker.start('prevent-app-suspension');
        }
    });
    ipcMain.on('stop-sleep-blocker', () => {
        if (blockerId !== undefined) {
            powerSaveBlocker.stop(blockerId);
            blockerId = undefined;
        }
    });

    ipcMain.on('disable-menu', () => {
        setEmptyMenu();
    });

    ipcMain.on('enable-menu', () => {
        setMainMenu({ mainWindow });
    });
};

const getValidPort = async (splashWindow: BrowserWindowWithSafeIpc) => {
    log.info('Attempting to check for a port...');
    const port = await portfinder.getPortPromise();
    if (!port) {
        log.warn('An open port could not be found');
        splashWindow.hide();
        const messageBoxOptions = {
            type: 'error',
            title: 'No open port',
            message:
                'This error should never happen, but if it does it means you are running a lot of servers on your computer that just happen to be in the port range I look for. Quit some of those and then this will work.',
        };
        await dialog.showMessageBox(messageBoxOptions);
        app.exit(1);
    }
    log.info(`Port found: ${port}`);
    ipcMain.handle('get-port', () => {
        if (getArguments().noBackend) {
            return 8000;
        }
        return port;
    });
    return port;
};

const getPythonVersion = async (pythonBin: string) => {
    const { stdout } = await exec(`${pythonBin} --version`);
    log.info(`Python version (raw): ${stdout}`);

    const { version } = semver.coerce(stdout)!;
    log.info(`Python version (semver): ${version}`);
    return version;
};

const checkPythonVersion = (version: string) => semver.gte(version, '3.7.0');

const checkPythonEnv = async (splashWindow: BrowserWindowWithSafeIpc) => {
    log.info('Attempting to check Python env...');

    let pythonInfo: PythonInfo;

    const useSystemPython = localStorage.getItem('use-system-python') === 'true';

    if (useSystemPython) {
        // User is using system python
        let validPythonVersion;
        let pythonBin;

        for (const py of ['python', 'python3']) {
            // eslint-disable-next-line no-await-in-loop
            const version = await getPythonVersion(py).catch(() => null);
            if (version && checkPythonVersion(version)) {
                validPythonVersion = version;
                pythonBin = py;
                break;
            }
        }

        if (!pythonBin || !validPythonVersion) {
            log.warn('Python binary not found or invalid');

            splashWindow.hide();
            const messageBoxOptions = {
                type: 'error',
                title: 'Python not installed or invalid version',
                buttons: ['Get Python', 'Exit'],
                defaultId: 1,
                message:
                    'It seems like you do not have a valid version of Python installed on your system. Please install Python (>= 3.7) to use this application. You can get Python from https://www.python.org/downloads/. Be sure to select the add to PATH option.',
            };
            const buttonResult = await dialog.showMessageBox(messageBoxOptions);
            if (buttonResult.response === 0) {
                await shell.openExternal('https://www.python.org/downloads/');
            }
            app.exit(1);
            return;
        }

        pythonInfo = { python: pythonBin, version: validPythonVersion };
    } else {
        // User is using bundled python
        const integratedPythonFolderPath = path.join(app.getPath('userData'), '/python');

        const platform = os.platform();
        let pythonPath;
        switch (platform) {
            case 'win32':
                pythonPath = path.resolve(
                    path.join(integratedPythonFolderPath, '/python/python.exe')
                );
                break;
            case 'linux':
                pythonPath = path.resolve(
                    path.join(integratedPythonFolderPath, '/python/bin/python3.9')
                );
                break;
            case 'darwin':
                pythonPath = path.resolve(
                    path.join(integratedPythonFolderPath, '/python/bin/python3.9')
                );
                break;
            default:
                throw new Error(`Platform ${platform} not supported`);
        }

        const pythonBinExists = await checkFileExists(pythonPath);

        if (!pythonBinExists) {
            log.info('Python not downloaded');
            try {
                const onProgress = (percentage: number | string) => {
                    splash.webContents.send('progress', Number(percentage));
                };
                splash.webContents.send('downloading-python');
                onProgress(0);
                log.info('Downloading standalone python...');
                await downloadPython(integratedPythonFolderPath, onProgress);
                log.info('Done downloading standalone python.');
                splash.webContents.send('extracting-python');
                onProgress(0);
                log.info('Extracting standalone python...');
                await extractPython(integratedPythonFolderPath, pythonPath, onProgress);
                log.info('Done extracting standalone python.');
            } catch (error) {
                log.error(error);
            }
        }

        let pythonVersion = await getPythonVersion(pythonPath).catch(() => null);
        if (!pythonVersion) {
            // TODO: Find a solution for this hack
            pythonVersion = 'unknown';
        }

        pythonInfo = { python: pythonPath, version: pythonVersion };
    }

    log.info(`Final Python binary: ${pythonInfo.python}`);
    log.info(pythonInfo);

    setPythonInfo(pythonInfo);
    ipcMain.handle('get-python', () => pythonInfo);
};

const checkPythonDeps = async (splashWindow: BrowserWindowWithSafeIpc) => {
    log.info('Attempting to check Python deps...');
    try {
        const pipList = await runPipList();
        const installedPackages = new Set(Object.keys(pipList));

        const pending = requiredDependencies.filter((dep) => {
            return dep.packages.some((pkg) => {
                if (installedPackages.has(pkg.packageName)) return false;
                log.info(`Dependency ${dep.name} (${pkg.packageName}) not found.`);
                return true;
            });
        });
        if (pending.length > 0) {
            log.info(`Installing ${pending.length} missing dependencies...`);
            splashWindow.webContents.send('installing-deps');
            await runPipInstall(pending);
        }
    } catch (error) {
        log.error(error);
    }
};

const checkNvidiaSmi = async () => {
    const registerEmptyGpuEvents = () => {
        ipcMain.handle('get-nvidia-gpu-name', () => null);
        ipcMain.handle('get-vram-usage', () => null);
    };

    const registerNvidiaSmiEvents = async (nvidiaSmi: string) => {
        const nvidiaGpu = await getNvidiaGpuName(nvidiaSmi);
        ipcMain.handle('get-nvidia-gpu-name', () => nvidiaGpu.trim());

        let vramChecker: ChildProcessWithoutNullStreams | undefined;
        let lastVRam: number | null = null;
        ipcMain.handle('get-vram-usage', () => {
            if (!vramChecker) {
                vramChecker = createNvidiaSmiVRamChecker(nvidiaSmi, 1000, (usage) => {
                    lastVRam = usage;
                });
            }

            return lastVRam;
        });
    };

    const nvidiaSmi = await getNvidiaSmi();

    if (nvidiaSmi) {
        try {
            await registerNvidiaSmiEvents(nvidiaSmi);
        } catch (error) {
            log.error(error);
            registerEmptyGpuEvents();
        }
    } else {
        registerEmptyGpuEvents();
    }
};

const spawnBackend = async (port: number) => {
    if (getArguments().noBackend) {
        return;
    }

    log.info('Attempting to spawn backend...');
    try {
        const backendPath = app.isPackaged
            ? path.join(process.resourcesPath, 'src', 'run.py')
            : './backend/src/run.py';
        const backend = spawn((await getPythonInfo()).python, [backendPath, String(port)]);
        backend.stdout.on('data', (data) => {
            const dataString = String(data);
            // Remove unneeded timestamp
            const fixedData = dataString.split('] ').slice(1).join('] ');
            log.info(`Backend: ${fixedData}`);
        });

        backend.stderr.on('data', (data) => {
            log.error(`Backend: ${String(data)}`);
        });

        backend.on('error', (error) => {
            log.error(`Python subprocess encountered an unexpected error: ${String(error)}`);
            const messageBoxOptions = {
                type: 'error',
                title: 'Unexpected Error',
                message: `The Python backend encountered an unexpected error. ChaiNNer will now exit. Error: ${String(
                    error
                )}`,
            };
            dialog.showMessageBoxSync(messageBoxOptions);
            app.exit(1);
        });

        backend.on('exit', (code, signal) => {
            log.error(
                `Python subprocess exited with code ${String(code)} and signal ${String(signal)}`
            );
        });

        ipcMain.handle('relaunch-application', () => {
            log.info('Attempting to kill backend...');
            try {
                const success = backend.kill();
                if (success) {
                    log.error('Successfully killed backend.');
                } else {
                    log.error('Error killing backend.');
                }
            } catch (error) {
                log.error('Error killing backend.', error);
            }
            app.relaunch();
            app.exit();
        });

        ipcMain.handle('kill-backend', () => {
            log.info('Attempting to kill backend...');
            try {
                const success = backend.kill();
                if (success) {
                    log.error('Successfully killed backend.');
                } else {
                    log.error('Error killing backend.');
                }
            } catch (error) {
                log.error('Error killing backend.', error);
            }
        });

        ipcMain.handle('restart-backend', () => {
            log.info('Attempting to kill backend...');
            try {
                const success = backend.kill();
                if (success) {
                    log.error('Successfully killed backend to restart it.');
                } else {
                    log.error('Error killing backend.');
                }
                ipcMain.removeHandler('kill-backend');
                spawnBackend(port);
            } catch (error) {
                log.error('Error restarting backend.', error);
            }
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                log.info('Attempting to kill backend...');
                try {
                    const success = backend.kill();
                    if (success) {
                        log.error('Successfully killed backend.');
                    } else {
                        log.error('Error killing backend.');
                    }
                } catch (error) {
                    log.error('Error killing backend.');
                }
            }
        });
        log.info('Successfully spawned backend.');
    } catch (error) {
        log.error('Error spawning backend.');
    }
};

const doSplashScreenChecks = async () =>
    new Promise<void>((resolve) => {
        splash = new BrowserWindow({
            width: 400,
            height: 400,
            frame: false,
            // backgroundColor: '#2D3748',
            center: true,
            minWidth: 400,
            minHeight: 400,
            maxWidth: 400,
            maxHeight: 400,
            resizable: false,
            minimizable: true,
            maximizable: false,
            closable: false,
            alwaysOnTop: true,
            titleBarStyle: 'hidden',
            transparent: true,
            roundedCorners: true,
            webPreferences: {
                webSecurity: false,
                nodeIntegration: true,
                contextIsolation: false,
            },
            // icon: `${__dirname}/public/icons/cross_platform/icon`,
            show: false,
        }) as BrowserWindowWithSafeIpc;
        splash.loadURL(SPLASH_SCREEN_WEBPACK_ENTRY);

        splash.once('ready-to-show', () => {
            splash.show();
            // splash.webContents.openDevTools();
        });

        splash.on('close', () => {
            mainWindow.destroy();
        });

        // Look, I just wanna see the cool animation
        const sleep = (ms: number) =>
            new Promise((r) => {
                setTimeout(r, ms);
            });

        // Send events to splash screen renderer as they happen
        // Added some sleep functions so I can see that this is doing what I want it to
        // TODO: Remove the sleeps (or maybe not, since it feels more like something is happening here)
        splash.webContents.once('dom-ready', async () => {
            splash.webContents.send('checking-port');
            const port = await getValidPort(splash);
            await sleep(250);

            splash.webContents.send('checking-python');
            await checkPythonEnv(splash);
            await sleep(250);

            splash.webContents.send('checking-deps');
            await checkPythonDeps(splash);
            await checkNvidiaSmi();
            await sleep(250);

            splash.webContents.send('spawning-backend');
            await spawnBackend(port);

            registerEventHandlers();

            splash.webContents.send('splash-finish');
            await sleep(250);

            resolve();
        });

        ipcMain.once('backend-ready', async () => {
            splash.webContents.send('finish-loading');
            splash.on('close', () => {});
            await sleep(500);
            splash.destroy();
            mainWindow.show();
            if (lastWindowSize?.maximized) {
                mainWindow.maximize();
            }
        });
    });

const createWindow = async () => {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: lastWindowSize?.width ?? 1280,
        height: lastWindowSize?.height ?? 720,
        backgroundColor: '#1A202C',
        minWidth: 720,
        minHeight: 640,
        darkTheme: nativeTheme.shouldUseDarkColors,
        roundedCorners: true,
        webPreferences: {
            webSecurity: false,
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            contextIsolation: false,
        },
        // icon: `${__dirname}/public/icons/cross_platform/icon`,
        show: false,
    }) as BrowserWindowWithSafeIpc;

    setMainMenu({ mainWindow });
    ipcMain.on('update-open-recent-menu', (_, openRecent) =>
        setMainMenu({ mainWindow, openRecentRev: openRecent })
    );

    await doSplashScreenChecks();

    // and load the index.html of the app.
    await mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

    // Open the DevTools.
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }

    let hasUnsavedChanges = false;
    ipcMain.on('update-has-unsaved-changes', (_, value) => {
        hasUnsavedChanges = value;
    });

    mainWindow.on('close', (event) => {
        if (hasUnsavedChanges) {
            const choice = dialog.showMessageBoxSync(mainWindow, {
                type: 'question',
                buttons: ['Yes', 'No'],
                defaultId: 1,
                title: 'Discard unsaved changes?',
                message:
                    'The current chain has some unsaved changes. Do you really want to quit without saving?',
            });
            if (choice === 1) event.preventDefault();
        }
    });

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-maximized-change', true);
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-maximized-change', false);
    });
    mainWindow.on('blur', () => {
        mainWindow.webContents.send('window-blur');
    });

    // Opening file with chaiNNer
    const { file: filepath } = getArguments();
    if (filepath) {
        const result = openSaveFile(filepath);
        ipcMain.handle('get-cli-open', () => result);
    } else {
        ipcMain.handle('get-cli-open', () => undefined);
    }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
    log.info('Cleaning up temp folders...');
    const tempDir = os.tmpdir();
    // find all the folders starting with 'chaiNNer-'
    const tempFolders = readdirSync(tempDir, { withFileTypes: true })
        .filter((dir) => dir.isDirectory())
        .map((dir) => dir.name)
        .filter((name) => name.includes('chaiNNer-'));
    tempFolders.forEach((folder) => {
        try {
            rmSync(path.join(tempDir, folder), { force: true, recursive: true });
        } catch (error) {
            log.error(`Error removing temp folder. ${String(error)}`);
        }
    });
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

process.on('uncaughtException', (err) => {
    const messageBoxOptions = {
        type: 'error',
        title: 'Error in Main process',
        message: `Something failed: ${String(err)}`,
    };
    dialog.showMessageBoxSync(messageBoxOptions);
    app.exit(1);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
