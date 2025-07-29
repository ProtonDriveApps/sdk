import { parseArgs } from "util";

import { init } from "./init";
import { getCommand, validateCommandArguments } from "./cli";

const { account, sdk, sdkDiagnostic, paths } = await init();

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

if (!command.isAuthAction) {
    if (!account.session) {
        throw new Error("You need to login first");
    }
    await account.loadPrimaryKeys();
    console.log("----------");
}

if (!options.json) {
    console.time("Command execution");
}

await command.action({
    account,
    sdk,
    sdkDiagnostic,
    paths,
    args,
    options,
});

if (!options.json) {
    console.timeEnd("Command execution");
}

process.exit()
