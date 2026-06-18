import { InitConfig } from '../config';
import { init } from '../init';
import { ExitError, isRecoverableReplError } from './errors';
import { Command } from './interface';
import { question } from './readline';
import { runCommand } from './run';
import { splitQuotedLine } from './splitQuotedLine';

export async function startRepl(commands: Command[], initOptions: InitConfig): Promise<void> {
    const session = await init(initOptions);

    try {
        while (true) {
            const line = await question('proton-drive> ', { enableHistory: true });
            if (line === null) {
                throw new ExitError();
            }
            const trimmed = line.trim();
            if (trimmed === '') {
                continue;
            }
            if (trimmed === 'exit' || trimmed === 'quit') {
                throw new ExitError();
            }
            try {
                const parts = splitQuotedLine(trimmed);
                const syntheticArgv = ['', '', ...parts];
                await runCommand(commands, syntheticArgv, initOptions, session);
            } catch (error: unknown) {
                if (isRecoverableReplError(error)) {
                    console.error(error instanceof Error ? error.message : String(error));
                    continue;
                }
                throw error;
            }
        }
    } finally {
        await session.dispose();
    }
}
