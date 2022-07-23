/* eslint-disable no-console */
import { spawn } from 'child_process';
import { requiredDependencies } from '../src/common/dependencies';
import { sanitizedEnv } from '../src/common/env';

try {
    const command = spawn(
        'python',
        [
            '-m',
            'pip',
            'install',
            ...requiredDependencies
                .map((d) => d.packages.map((p) => `${p.packageName}==${p.version}`))
                .flat(),
            '--disable-pip-version-check',
        ],
        {
            env: sanitizedEnv,
        }
    );

    command.stdout.on('data', (data: unknown) => {
        console.log(String(data));
    });

    command.stderr.on('data', (data: unknown) => {
        console.error(String(data));
    });

    command.on('error', (error) => {
        console.error(error);
        process.exit(1);
    });

    command.on('close', (code) => {
        process.exit(code ?? 1);
    });
} catch (error) {
    console.error(String(error));
}
