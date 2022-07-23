import os from 'os';

export const isMac = process.platform === 'darwin';
export const isM1 = isMac && (os.cpus()[0]?.model.includes('Apple M1') ?? false);

export const isRenderer = typeof process !== 'undefined' && process.type === 'renderer';

const env = { ...process.env };
delete env.PYTHONHOME;
export const sanitizedEnv = env;
