import {
    BrowserWindow,
    IpcMainEvent,
    IpcMainInvokeEvent,
    IpcRendererEvent,
    MessagePortMain,
    WebContents,
    ipcMain as unsafeIpcMain,
    ipcRenderer as unsafeIpcRenderer,
} from 'electron';
import { Systeminformation } from 'systeminformation';
import { FileOpenResult, FileSaveResult, PythonInfo } from './common-types';
import { ParsedSaveData, SaveData } from './SaveFile';

interface ChannelInfo<ReturnType, Args extends unknown[] = []> {
    returnType: ReturnType;
    args: Args;
}
type SendChannelInfo<Args extends unknown[] = []> = ChannelInfo<void, Args>;

export interface InvokeChannels {
    'get-nvidia-gpu-name': ChannelInfo<string | null>;
    'get-gpu-info': ChannelInfo<Systeminformation.GraphicsData>;
    'get-python': ChannelInfo<PythonInfo>;
    'get-port': ChannelInfo<number>;
    'get-localstorage-location': ChannelInfo<string>;
    'get-app-version': ChannelInfo<string>;
    'get-vram-usage': ChannelInfo<number | null>;
    'dir-select': ChannelInfo<Electron.OpenDialogReturnValue, [dirPath: string]>;
    'file-select': ChannelInfo<
        Electron.OpenDialogReturnValue,
        [
            filters: Electron.FileFilter[],
            allowMultiple: boolean | undefined,
            dirPath: string | undefined
        ]
    >;

    'file-save-json': ChannelInfo<void, [saveData: SaveData, savePath: string]>;
    'file-save-as-json': ChannelInfo<
        FileSaveResult,
        [saveData: SaveData, defaultPath: string | undefined]
    >;
    'get-cli-open': ChannelInfo<FileOpenResult<ParsedSaveData> | undefined>;
    'owns-backend': ChannelInfo<boolean>;
    'kill-backend': ChannelInfo<void>;
    'restart-backend': ChannelInfo<void>;
    'relaunch-application': ChannelInfo<void>;
    'quit-application': ChannelInfo<void>;
}

export interface SendChannels {
    'backend-ready': SendChannelInfo;
    'checking-deps': SendChannelInfo;
    'checking-port': SendChannelInfo;
    'checking-python': SendChannelInfo;
    'downloading-python': SendChannelInfo;
    'extracting-python': SendChannelInfo;
    'file-new': SendChannelInfo;
    'file-open': SendChannelInfo<[FileOpenResult<ParsedSaveData>]>;
    'file-save-as': SendChannelInfo;
    'file-save': SendChannelInfo;
    'finish-loading': SendChannelInfo;
    'installing-deps': SendChannelInfo;
    'installing-main-deps': SendChannelInfo;
    progress: SendChannelInfo<[percentage: number]>;
    'spawning-backend': SendChannelInfo;
    'splash-finish': SendChannelInfo;
    'start-sleep-blocker': SendChannelInfo;
    'stop-sleep-blocker': SendChannelInfo;
    'update-has-unsaved-changes': SendChannelInfo<[boolean]>;
    'update-open-recent-menu': SendChannelInfo<[string[]]>;
    'clear-open-recent': SendChannelInfo;
    'window-maximized-change': SendChannelInfo<[maximized: boolean]>;
    'window-blur': SendChannelInfo;
    'show-collected-information': SendChannelInfo<[info: Record<string, unknown>]>;
    'disable-menu': SendChannelInfo;
    'enable-menu': SendChannelInfo;

    // history
    'history-undo': SendChannelInfo;
    'history-redo': SendChannelInfo;

    // edit
    cut: SendChannelInfo;
    copy: SendChannelInfo;
    paste: SendChannelInfo;
}
export type ChannelArgs<C extends keyof (InvokeChannels & SendChannels)> = (InvokeChannels &
    SendChannels)[C]['args'];
export type ChannelReturn<C extends keyof (InvokeChannels & SendChannels)> = (InvokeChannels &
    SendChannels)[C]['returnType'];

interface SafeIpcMain extends Electron.IpcMain {
    handle<C extends keyof InvokeChannels>(
        channel: C,
        listener: (
            event: IpcMainInvokeEvent,
            ...args: ChannelArgs<C>
        ) => Promise<ChannelReturn<C>> | ChannelReturn<C>
    ): void;
    handleOnce<C extends keyof InvokeChannels>(
        channel: C,
        listener: (
            event: IpcMainInvokeEvent,
            ...args: ChannelArgs<C>
        ) => Promise<ChannelReturn<C>> | ChannelReturn<C>
    ): void;
    on<C extends keyof SendChannels>(
        channel: C,
        listener: (event: IpcMainEvent, ...args: ChannelArgs<C>) => void
    ): this;
    once<C extends keyof SendChannels>(
        channel: C,
        listener: (event: IpcMainEvent, ...args: ChannelArgs<C>) => void
    ): this;
    removeAllListeners(channel?: keyof SendChannels): this;
    removeHandler(channel: keyof InvokeChannels): void;
    removeListener<C extends keyof SendChannels>(
        channel: C,
        listener: (event: IpcMainEvent | IpcMainInvokeEvent, ...args: ChannelArgs<C>) => void
    ): this;
}

interface SafeIpcRenderer extends Electron.IpcRenderer {
    invoke<C extends keyof InvokeChannels>(
        channel: C,
        ...args: ChannelArgs<C>
    ): Promise<ChannelReturn<C>>;
    on<C extends keyof SendChannels>(
        channel: C,
        listener: (event: IpcRendererEvent, ...args: ChannelArgs<C>) => void
    ): this;
    once<C extends keyof SendChannels>(
        channel: C,
        listener: (event: IpcRendererEvent, ...args: ChannelArgs<C>) => void
    ): this;
    postMessage(channel: keyof SendChannels, message: unknown, transfer?: MessagePort[]): void;
    removeAllListeners(channel: keyof SendChannels): this;
    removeListener<C extends keyof SendChannels>(
        channel: C,
        listener: (event: IpcRendererEvent, ...args: ChannelArgs<C>) => void
    ): this;
    send<C extends keyof SendChannels>(channel: C, ...args: ChannelArgs<C>): void;
    sendSync<C extends keyof SendChannels>(channel: C, ...args: ChannelArgs<C>): void;
    sendTo<C extends keyof SendChannels>(
        webContentsId: number,
        channel: C,
        ...args: ChannelArgs<C>
    ): void;
    sendToHost<C extends keyof SendChannels>(channel: C, ...args: ChannelArgs<C>): void;
}

interface WebContentsWithSafeIcp extends WebContents {
    invoke<C extends keyof SendChannels>(
        channel: C,
        ...args: ChannelArgs<C>
    ): Promise<ChannelReturn<C>>;
    postMessage(channel: keyof SendChannels, message: unknown, transfer?: MessagePortMain[]): void;
    send<C extends keyof SendChannels>(channel: C, ...args: ChannelArgs<C>): void;
    sendSync<C extends keyof SendChannels>(channel: C, ...args: ChannelArgs<C>): ChannelReturn<C>;
    sendTo<C extends keyof SendChannels>(
        webContentsId: number,
        channel: C,
        ...args: ChannelArgs<C>
    ): void;
    sendToHost<C extends keyof SendChannels>(channel: C, ...args: ChannelArgs<C>): void;
}
export interface BrowserWindowWithSafeIpc extends BrowserWindow {
    webContents: WebContentsWithSafeIcp;
}

export const ipcMain = unsafeIpcMain as SafeIpcMain;
export const ipcRenderer = unsafeIpcRenderer as SafeIpcRenderer;
