import { InitConfig } from '../config';
import { init } from '../init';
import { captureException, flushSentry } from '../telemetry';
import { AuthRequiredError, ExitError, isRecoverableReplError } from './errors';
import { formatReadableJson } from './formatters';
import { printCommandUsage, printUsage } from './help';
import { Command } from './interface';
import { getCommand, getCommandArguments } from './registryCore';
import { printVersions } from './version';

export type CliSession = Awaited<ReturnType<typeof init>>;

export async function runSingleInvocation(commands: Command[], argv: string[], initOptions: InitConfig): Promise<void> {
    try {
        await runCommand(commands, argv, initOptions);
    } catch (error: unknown) {
        if (error instanceof ExitError) {
            process.exit(2);
            return;
        }
        if (isRecoverableReplError(error)) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
            return;
        }
        reportFatalError(error);
        captureException(error);
        await flushSentry();
        process.exit(1);
    }
}

export async function runCommand(
    commands: Command[],
    argv: string[],
    initOptions: InitConfig,
    session?: CliSession,
): Promise<void> {
    const result = await parseCliInvocation(commands, argv, initOptions);
    if (!result) {
        return;
    }
    const { command, options, args } = result;

    if (options['help']) {
        printCommandUsage(command);
        return;
    }

    const oneOffSession = !session;
    session = session ?? (await init({ ...initOptions, enableConsoleLog: !!options.verbose }));
    verifyAuthentication(command, session);
    try {
        await command.action({
            ...session,
            args,
            options,
        });
    } finally {
        if (oneOffSession) {
            await session.dispose();
        }
    }
}

async function parseCliInvocation(commands: Command[], argv: string[], initOptions: InitConfig) {
    const groupName = argv[2]!;
    const commandName = argv[3]!;

    if (groupName === 'help' || groupName === '--help' || groupName === '-h') {
        printUsage(commands);
        return;
    }

    if (groupName === 'version' || groupName === '--version' || groupName === '-v') {
        await printVersions(initOptions);
        return;
    }

    const command = getCommand(commands, groupName, commandName);
    const { options, args } = getCommandArguments(command, argv);
    return { command, options, args };
}

function verifyAuthentication(command: Command, session: CliSession) {
    if (!command.isAuthAction && !command.isPublicAction && !session.auth.isLoggedIn()) {
        throw new AuthRequiredError();
    }
}

function reportFatalError(error: unknown) {
    console.error('===============================================');
    console.trace(error);
    if (error != null && typeof error === 'object') {
        console.debug('Error details:');
        console.debug(formatReadableJson(Object.fromEntries(Object.entries(error))));
    }
}
