import * as readline from 'node:readline/promises';

import { ProtonDriveError } from '@protontech/drive-sdk';

import { AccountApiError } from '../api/accountApi';
import { InitConfig } from '../config';
import { init } from '../init';
import { CommandError } from './errors';
import { Command } from './interface';
import { ReplUnclosedQuoteError, splitQuotedLine } from './splitQuotedLine';
import { runCommand } from './run';

export async function startRepl(commands: Command[], initOptions: InitConfig): Promise<void> {
    const session = await init(initOptions);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
        while (true) {
            const line = await rl.question('proton-drive> ');
            const trimmed = line.trim();
            if (trimmed === '') {
                continue;
            }
            if (trimmed === 'exit' || trimmed === 'quit') {
                break;
            }
            let parts: string[];
            try {
                parts = splitQuotedLine(trimmed);
            } catch (error: unknown) {
                if (isRecoverableReplError(error)) {
                    console.error(error);
                    continue;
                }
                throw error;
            }
            const syntheticArgv = ['', '', ...parts];
            try {
                await runCommand(commands, syntheticArgv, initOptions, session);
            } catch (error: unknown) {
                if (isRecoverableReplError(error)) {
                    console.error(error);
                    continue;
                }
                throw error;
            }
        }
    } finally {
        rl.close();
    }
}

function isRecoverableReplError(error: unknown): boolean {
    if (
        error instanceof ProtonDriveError ||
        error instanceof CommandError ||
        error instanceof AccountApiError ||
        error instanceof ReplUnclosedQuoteError
    ) {
        return true;
    }
    if (error instanceof TypeError) {
        const code = (error as NodeJS.ErrnoException).code;
        return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS_');
    }
    return false;
}
