import { parseArgs } from 'util';

import { ProtonDriveError } from '@protontech/drive-sdk';

import { init } from '../init';
import { InitConfig } from '../config';
import { AuthRequiredError } from './errors';
import { formatReadableJson } from './formatters';
import { Command } from './interface';
import { getCommand, printCommandUsage, validateCommandArguments } from './registryCore';

export type CliSession = Awaited<ReturnType<typeof init>>;

export async function runSingleInvocation(
    commands: Command[],
    argv: string[],
    initOptions: InitConfig,
    session?: CliSession,
): Promise<void> {
    try {
        await runCommand(commands, argv, initOptions, session);
    } catch (error: unknown) {
        if (error instanceof ProtonDriveError) {
            console.error(error.message);
            process.exit(1);
            return;
        }
        reportFatalError(error);
        process.exit(1);
    }
}

export async function runCommand(
    commands: Command[],
    argv: string[],
    initOptions: InitConfig,
    session?: CliSession,
): Promise<void> {
    const { command, options, args } = parseCliInvocation(commands, argv);

    if (options['help']) {
        printCommandUsage(command);
        return;
    }

    const debug = initOptions.debug === undefined ? !options.json : initOptions.debug;
    session = session ?? await init({ ...initOptions, debug });
    verifyAuthentication(command, session);
    await dispatchAction(command, session, args, options, debug);
}

function parseCliInvocation(commands: Command[], argv: string[]) {
    const groupName = argv[2]!;
    const commandName = argv[3]!;
    const command = getCommand(commands, groupName, commandName);
    const { values: options, positionals } = parseArgs({
        args: argv,
        options: command.options || {},
        strict: true,
        allowPositionals: true,
    });
    const args = positionals.slice(4);
    validateCommandArguments(command, args, options);
    return { command, options, args };
}

function verifyAuthentication(command: Command, session: CliSession) {
    if (!command.isAuthAction && !command.isPublicAction && !session.auth.isLoggedIn()) {
        throw new AuthRequiredError();
    }
}

async function dispatchAction(
    command: Command,
    session: CliSession,
    args: string[],
    options: { [name: string]: unknown },
    debug: boolean,
) {
    if (debug) {
        console.time('Command execution');
    }
    try {
        await command.action({
            auth: session.auth,
            sdk: session.sdk,
            photosSdk: session.photosSdk,
            sdkDiagnostic: session.sdkDiagnostic,
            paths: session.paths,
            args,
            options,
        });
    } finally {
        if (debug) {
            console.timeEnd('Command execution');
        }
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
