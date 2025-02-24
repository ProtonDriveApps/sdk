import { parseArgs } from "util";

import { init } from "./init";
import { getCommand, validateCommandArguments } from "./cli";

const { account, sdk, paths } = await init();

const commandName = Bun.argv[2];
const command = getCommand(commandName);

const { values: options, positionals } = parseArgs({
    args: Bun.argv,
    options: command.options || {},
    strict: true,
    allowPositionals: true,
});

const args = positionals.slice(3);
validateCommandArguments(command, args, options);

if (!command.isAuthAction) {
    if (!account.session) {
        throw new Error("You need to login first");
    }
    await account.loadPrimaryKeys();
}

await command.action({
    account,
    sdk,
    paths,
    args,
    options,
});

process.exit()
