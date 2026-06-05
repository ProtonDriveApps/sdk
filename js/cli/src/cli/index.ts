import { InitConfig } from '../config';
import { Command } from './interface';
import { startRepl } from './repl';
import { runSingleInvocation } from './run';

export { ExitError } from './errors';
export {
    formatAuthor,
    formatDate,
    formatMemberRole,
    formatReadableJson,
    formatSize,
    printIterable,
    printObject,
    sanitizeTerminalText,
} from './formatters';
export type { ActionArgs, Command, Options } from './interface';
export { findName, getClaimedSize, getName } from './node';
export { openBrowserUrl } from './openBrowserUrl';
export { Path, Paths, PathType } from './paths';
export { readPasswordLine } from './readPasswordLine';
export { applyDefaultCliOptions } from './registryCore';
export type { CliSession } from './run';

export async function run(commands: Command[], initOptions: InitConfig) {
    if (shouldStartRepl(Bun.argv)) {
        await startRepl(commands, initOptions);
    } else {
        await runSingleInvocation(commands, Bun.argv, initOptions);
    }
}

function shouldStartRepl(argv: string[]): boolean {
    return argv[2] == null || argv[2] === '';
}
