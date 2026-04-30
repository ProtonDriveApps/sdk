import { ProtonDriveError } from '@protontech/drive-sdk';

import { AccountApiError } from '../api/accountApi';
import { InitConfig } from '../config';
import { init } from '../init';
import { CommandError } from './errors';
import { Command } from './interface';
import { question } from './readline';
import { runCommand } from './run';
import { ReplUnclosedQuoteError, splitQuotedLine } from './splitQuotedLine';

export async function startRepl(commands: Command[], initOptions: InitConfig): Promise<void> {
    const session = await init(initOptions);

    try {
        while (true) {
            const line = await question('proton-drive> ');
            const trimmed = line.trim();
            if (trimmed === '') {
                continue;
            }
            if (trimmed === 'exit' || trimmed === 'quit') {
                break;
            }
            try {
                const parts = splitQuotedLine(trimmed);
                const syntheticArgv = ['', '', ...parts];
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
        await session.dispose();
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
