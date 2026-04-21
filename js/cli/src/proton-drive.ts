import { parseArgs } from 'util';

import { init } from './init';
import { getCommand, validateCommandArguments, formatReadableJson } from './cli';

const groupName = Bun.argv[2];
const commandName = Bun.argv[3];
const command = getCommand(groupName, commandName);

const { values: options, positionals } = parseArgs({
    args: Bun.argv,
    options: command.options || {},
    strict: true,
    allowPositionals: true,
});

const args = positionals.slice(4);
validateCommandArguments(command, args, options);

const debug = !options.json;

const { auth, sdk, photosSdk, sdkDiagnostic, paths } = await init(debug);

if (!command.isAuthAction && !command.isPublicAction && !auth.isLoggedIn()) {
    throw new Error('You need to login first');
}

if (debug) {
    console.time('Command execution');
}

try {
    await command.action({
        auth,
        sdk,
        photosSdk,
        sdkDiagnostic,
        paths,
        args,
        options,
    });
} catch (error: unknown) {
    console.error('===============================================');
    console.trace(error);

    // Get all the object properties and convert through JSON to avoid custom object interpretation.
    console.debug('Error details:');
    console.debug(formatReadableJson(Object.fromEntries(Object.entries(error as object))));

    process.exit(1);
}

if (debug) {
    console.timeEnd('Command execution');
}

process.exit();
