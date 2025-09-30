import { parseArgs } from 'util';

import { VERSION } from '../../sdk/src';

import { init } from './init';
import { getCommand, validateCommandArguments } from './cli';

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

const { account, sdk, photosSdk, sdkDiagnostic, paths } = await init();

if (debug) {
    console.log(`Proton Drive SDK for web v${VERSION}`);
}

if (!command.isAuthAction) {
    if (!account.session) {
        throw new Error('You need to login first');
    }
    if (debug) {
        console.time('Account initialization');
        console.log('Initializing user keys...');
    }
    await account.loadPrimaryKeys();
    if (debug) {
        console.timeEnd('Account initialization');
    }
}

if (debug) {
    console.time('Command execution');
}

await command.action({
    account,
    sdk,
    photosSdk,
    sdkDiagnostic,
    paths,
    args,
    options,
});

if (debug) {
    console.timeEnd('Command execution');
}

process.exit();
