/* eslint-disable no-param-reassign */
import { spawn } from 'child_process';
import log from 'electron-log';
import { Dependency } from './dependencies';
import { sanitizedEnv } from './env';
import { pipInstallWithProgress } from './pipInstallWithProgress';
import { getPythonInfo } from './python';
import { noop } from './util';

export interface OnStdio {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
}

export const runPip = async (args: readonly string[], onStdio: OnStdio = {}): Promise<string> => {
    const { onStdout = noop, onStderr = (data) => log.error(data) } = onStdio;

    const { python } = await getPythonInfo();

    // defensive copy in case the args array is changed
    args = ['-m', 'pip', ...args, '--disable-pip-version-check'];

    return new Promise<string>((resolve, reject) => {
        log.info(`Python executable: ${python}`);
        log.info(`Running pip command: ${args.slice(1).join(' ')}`);

        const child = spawn(python, args, {
            env: sanitizedEnv,
        });

        let stdout = '';

        child.stdout.on('data', (data) => {
            const str = String(data);
            stdout += str;
            onStdout(str);
        });

        child.stderr.on('data', (data) => {
            onStderr(String(data));
        });

        child.on('error', (error) => {
            log.warn(`Pip process errored: ${String(error)}`);
            reject(error);
        });
        child.on('exit', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                const message = `Pip process exited with non-zero exit code ${String(code)}`;
                log.warn(message);
                reject(new Error(message));
            }
        });
    });
};

export type PipList = { [packageName: string]: string };

export const runPipList = async (onStdio?: OnStdio): Promise<PipList> => {
    const output = await runPip(['list', '--format=json'], onStdio);

    interface ListEntry {
        name: string;
        version: string;
    }
    const list = JSON.parse(output) as ListEntry[];

    return Object.fromEntries(list.map((e) => [e.name, e.version]));
};

export const runPipInstall = async (
    dependencies: readonly Dependency[],
    onProgress?: (percentage: number) => void,
    onStdio?: OnStdio
): Promise<void> => {
    onProgress?.(0);
    if (onProgress === undefined) {
        // TODO: implement progress via this method (if possible)
        const deps = dependencies
            .map((d) => d.packages.map((p) => `${p.packageName}==${p.version}`))
            .flat();
        await runPip(['install', '--upgrade', ...deps], onStdio);
    } else {
        const { python } = await getPythonInfo();
        for (const dep of dependencies) {
            for (const pkg of dep.packages) {
                // eslint-disable-next-line no-await-in-loop
                await pipInstallWithProgress(python, pkg, onProgress, onStdio);
            }
        }
    }
    onProgress?.(100);
};

export const runPipUninstall = async (
    dependencies: readonly Dependency[],
    onProgress?: (percentage: number) => void,
    onStdio?: OnStdio
): Promise<void> => {
    onProgress?.(10);
    const deps = dependencies.map((d) => d.packages.map((p) => p.packageName)).flat();
    onProgress?.(25);
    await runPip(['uninstall', '-y', ...deps], onStdio);
    onProgress?.(100);
};

export const upgradePip = async (onStdio?: OnStdio) => {
    await runPip(['install', '--upgrade', 'pip', '--no-warn-script-location'], onStdio);
};
