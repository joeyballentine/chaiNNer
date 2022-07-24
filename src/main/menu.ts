/* eslint-disable @typescript-eslint/no-misused-promises */
import { Menu, MenuItemConstructorOptions, app, dialog, shell } from 'electron';
import os from 'os';
import path from 'path';
import { isMac } from '../common/env';
import { BrowserWindowWithSafeIpc } from '../common/safeIpc';
import { openSaveFile } from '../common/SaveFile';
import { getCpuInfo, getGpuInfo } from './systemInfo';

export interface MainMenuArgs {
    mainWindow: BrowserWindowWithSafeIpc;
    openRecentRev?: string[];
}

export const setMainMenu = ({ mainWindow, openRecentRev = [] }: MainMenuArgs) => {
    const openRecent = openRecentRev.reverse();
    const defaultPath = openRecent[0] ? path.dirname(openRecent[0]) : undefined;

    const template = [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow.webContents.send('file-new');
                    },
                },
                {
                    label: 'Open...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const {
                            canceled,
                            filePaths: [filepath],
                        } = await dialog.showOpenDialog(mainWindow, {
                            title: 'Open Chain File',
                            defaultPath,
                            filters: [{ name: 'Chain', extensions: ['chn'] }],
                            properties: ['openFile'],
                        });
                        if (canceled) return;

                        mainWindow.webContents.send('file-open', await openSaveFile(filepath));
                    },
                },
                {
                    label: 'Open Recent',
                    submenu: [
                        ...(openRecent.length === 0
                            ? [
                                  {
                                      label: 'No entries',
                                      enabled: false,
                                  } as MenuItemConstructorOptions,
                              ]
                            : openRecent.map<MenuItemConstructorOptions>((filepath, i) => ({
                                  label: filepath,
                                  accelerator: i <= 9 ? `CmdOrCtrl+${i + 1}` : undefined,
                                  click: async () => {
                                      mainWindow.webContents.send(
                                          'file-open',
                                          await openSaveFile(filepath)
                                      );
                                  },
                              }))),
                        { type: 'separator' },
                        {
                            label: 'Clear Recently Opened',
                            click: () => {
                                mainWindow.webContents.send('clear-open-recent');
                            },
                        },
                    ],
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        mainWindow.webContents.send('file-save');
                    },
                },
                {
                    label: 'Save As...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => {
                        mainWindow.webContents.send('file-save-as');
                    },
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    registerAccelerator: false,
                    click: () => {
                        mainWindow.webContents.send('history-undo');
                    },
                },
                {
                    label: 'Redo',
                    accelerator: 'CmdOrCtrl+Y',
                    registerAccelerator: false,
                    click: () => {
                        mainWindow.webContents.send('history-redo');
                    },
                },
                { type: 'separator' },
                {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    registerAccelerator: false,
                    click: () => {
                        mainWindow.webContents.send('cut');
                    },
                },
                {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    registerAccelerator: false,
                    click: () => {
                        mainWindow.webContents.send('copy');
                    },
                },
                {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    registerAccelerator: false,
                    click: () => {
                        mainWindow.webContents.send('paste');
                    },
                },
                // ...(isMac ? [
                //   { role: 'delete' },
                //   { role: 'selectAll' },
                //   { type: 'separator' },
                //   {
                //     label: 'Speech',
                //     submenu: [
                //       { role: 'startSpeaking' },
                //       { role: 'stopSpeaking' },
                //     ],
                //   },
                // ] : [
                //   { role: 'delete' },
                //   { type: 'separator' },
                //   { role: 'selectAll' },
                // ]),
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac
                    ? [
                          { type: 'separator' },
                          { role: 'front' },
                          { type: 'separator' },
                          { role: 'window' },
                      ]
                    : [{ role: 'close' }]),
                ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
            ],
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'View README',
                    click: async () => {
                        await shell.openExternal(
                            'https://github.com/joeyballentine/chaiNNer/blob/main/README.md'
                        );
                    },
                },
                {
                    label: 'Open logs folder',
                    click: async () => {
                        await shell.openPath(app.getPath('logs'));
                    },
                },
                {
                    label: 'Get ESRGAN models',
                    click: async () => {
                        await shell.openExternal('https://upscale.wiki/wiki/Model_Database');
                    },
                },
                {
                    label: 'Convert ONNX models to NCNN',
                    click: async () => {
                        await shell.openExternal('https://convertmodel.com/');
                    },
                },
                { type: 'separator' },
                {
                    label: 'Collect system information',
                    click: async () => {
                        const [cpuInfo, gpuInfo] = await Promise.all([getCpuInfo(), getGpuInfo()]);

                        const information: Record<string, unknown> = {
                            app: {
                                version: app.getVersion(),
                                packaged: app.isPackaged,
                                path: app.getAppPath(),
                            },
                            process: {
                                cwd: process.cwd(),
                                argv: process.argv,
                            },
                            os: {
                                version: os.version(),
                                release: os.release(),
                                arch: os.arch(),
                                endianness: os.endianness(),
                            },
                            cpu: { ...cpuInfo },
                            gpus: gpuInfo.controllers.map((c) => ({ ...c })),
                        };

                        mainWindow.webContents.send('show-collected-information', information);
                    },
                },
            ],
        },
    ] as MenuItemConstructorOptions[];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
};

export const setEmptyMenu = () => {
    const template = [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New',
                    enabled: false,
                },
                {
                    label: 'Open...',
                    enabled: false,
                },
                {
                    label: 'Open Recent',
                    enabled: false,
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    enabled: false,
                },
                {
                    label: 'Save As...',
                    enabled: false,
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    enabled: false,
                },
                {
                    label: 'Redo',
                    enabled: false,
                },
                { type: 'separator' },
                {
                    label: 'Cut',
                    enabled: false,
                },
                {
                    label: 'Copy',
                    enabled: false,
                },
                {
                    label: 'Paste',
                    enabled: false,
                },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload', enabled: false },
                { role: 'forceReload', enabled: false },
                { type: 'separator' },
                { role: 'resetZoom', enabled: false },
                { role: 'zoomIn', enabled: false },
                { role: 'zoomOut', enabled: false },
                { type: 'separator' },
                { role: 'togglefullscreen', enabled: false },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize', enabled: false },
                { role: 'zoom', enabled: false },
                ...(isMac
                    ? [
                          { type: 'separator' },
                          { role: 'front', enabled: false },
                          { type: 'separator' },
                          { role: 'window', enabled: false },
                      ]
                    : [{ role: 'close', enabled: false }]),
                ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
            ],
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'View README',
                    click: async () => {
                        await shell.openExternal(
                            'https://github.com/joeyballentine/chaiNNer/blob/main/README.md'
                        );
                    },
                },
                {
                    label: 'Open logs folder',
                    click: async () => {
                        await shell.openPath(app.getPath('logs'));
                    },
                },
                {
                    label: 'Get ESRGAN models',
                    click: async () => {
                        await shell.openExternal('https://upscale.wiki/wiki/Model_Database');
                    },
                },
                {
                    label: 'Convert ONNX models to NCNN',
                    click: async () => {
                        await shell.openExternal('https://convertmodel.com/');
                    },
                },
                { type: 'separator' },
                {
                    label: 'Collect system information',
                    enabled: false,
                },
            ],
        },
    ] as MenuItemConstructorOptions[];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
};
