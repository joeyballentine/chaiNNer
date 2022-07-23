import { execSync, spawn } from 'child_process';
import log from 'electron-log';
import fs from 'fs';
import https from 'https';
import Downloader from 'nodejs-file-downloader';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import { PyPiPackage } from './dependencies';
import { sanitizedEnv } from './env';
import { noop } from './util';

export interface OnStdio {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
}

const tempDir = os.tmpdir();

const isValidUrl = (s: string): boolean => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const url = new URL(s);
        return true;
    } catch (_) {
        return false;
    }
};

const downloadWheelAndInstall = async (
    pythonPath: string,
    url: string,
    fileName: string,
    onProgress?: (percent: number) => void,
    onStdio: OnStdio = {}
) =>
    new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { onStdout = noop, onStderr = (data) => log.error(data) } = onStdio;
        let lastProgressNum: number | null = null;
        const downloader = new Downloader({
            url,
            directory: tempDir,
            fileName,
            onProgress: (percentage) => {
                const progressNum = Math.floor(Number(percentage));
                if (progressNum % 5 === 0 && lastProgressNum !== progressNum) {
                    onStdout(`Download at: ${progressNum}%\n`);
                    lastProgressNum = progressNum;
                }
                onProgress?.(Number(percentage) * 0.9 + 1);
            },
        });

        try {
            downloader.download().then(() => {
                onProgress?.(98);
                onStdout('Installing package from whl...\n');
                const installProcess = spawn(
                    pythonPath,
                    ['-m', 'pip', 'install', path.join(tempDir, fileName)],
                    { env: sanitizedEnv }
                );
                installProcess.stdout.on('data', (data) => {
                    onStdout(String(data));
                });
                installProcess.on('close', () => {
                    onProgress?.(99);
                    fs.rmSync(path.join(tempDir, fileName));
                    // onOutput('Temp files removed.\n');
                    onProgress?.(100);
                    resolve();
                });
            }, reject);
        } catch (error) {
            log.error(error);
            reject(error);
        }
    });

export const pipInstallWithProgress = async (
    python: string,
    pkg: PyPiPackage,
    onProgress?: (percentage: number) => void,
    onStdio: OnStdio = {}
) =>
    new Promise<Buffer | void>((resolve, reject) => {
        const { onStdout = noop, onStderr = (data) => log.error(data) } = onStdio;
        log.info('Beginning pip install...');
        onProgress?.(0);
        let args = [
            'install',
            '--upgrade',
            `${pkg.packageName}==${pkg.version}`,
            '--disable-pip-version-check',
        ];
        if (pkg.findLink) {
            args = [...args, '-f', pkg.findLink];
        }
        const pipRequest = spawn(python, ['-m', 'pip', ...args]);

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        pipRequest.stdout.on('data', async (data) => {
            const stringData = String(data);
            onStdout(stringData);
            const wheelRegex = /([^\s\\]*)[.]whl/g;
            const matches = stringData.match(wheelRegex);
            if (matches) {
                const [wheelFileName] = matches;
                pipRequest.kill();
                onProgress?.(1);
                log.info(`Found whl: ${wheelFileName}`);

                if (isValidUrl(wheelFileName)) {
                    const wheelName = wheelFileName.split('/').slice(-1)[0];
                    await downloadWheelAndInstall(
                        python,
                        wheelFileName,
                        wheelName,
                        onProgress,
                        onStdio
                    ).then(() => {
                        resolve();
                    });
                } else {
                    const req = https.get(
                        `https://pypi.org/pypi/${pkg.packageName}/json`,
                        (res) => {
                            let output = '';

                            res.on('data', (d) => {
                                output += String(d);
                            });

                            res.on('close', () => {
                                if (output) {
                                    const releaseData = JSON.parse(output) as {
                                        releases: Record<
                                            string,
                                            { filename: string; url: string }[]
                                        >;
                                    };
                                    const releases = Array.from(releaseData.releases[pkg.version]);
                                    const find = releases.find(
                                        (file) => file.filename === wheelFileName
                                    );
                                    if (!find)
                                        throw new Error(
                                            `Unable for find correct file for ${pkg.packageName}==${pkg.version}`
                                        );
                                    const { url } = find;
                                    onStdout(`Downloading package from PyPi at: ${url}\n`);
                                    downloadWheelAndInstall(
                                        python,
                                        url,
                                        wheelFileName,
                                        onProgress,
                                        onStdio
                                    ).then(() => resolve(), reject);
                                }
                            });
                        }
                    );

                    req.on('error', (error) => {
                        onStderr(String(error));
                        log.error('Error installing normal way, resorting to generic pip install.');
                        const result = execSync(`${python} -m pip ${args.join(' ')}`);
                        resolve(result);
                    });

                    req.end();
                }
            }
        });

        pipRequest.stderr.on('data', () => {
            // log.debug(String(data));
        });

        pipRequest.on('error', (error) => {
            onStderr(String(error));
            reject(error);
        });

        pipRequest.on('close', (code) => {
            if (code === 0) {
                resolve();
            }
        });
    });
