import { parseArgs } from "util";

import { init } from "./init";
import { commands } from "./commands";

const { account, sdk, fileSystem } = await init();

const commandName = Bun.argv[2];

function printCommandUsage(name: string, command: typeof commands[keyof typeof commands]) {
    const args = (command.args || []).map(arg => `<${arg}>`).join(' ');
    const options = Object.entries(command.options || {}).map(([name, { type }]) => `--${name} <${type}>`).join(' ');
    console.log(`  ${name} ${args} ${options}`);
}

const command = commands[commandName];
if (!command) {
    console.log(`Command not found: ${commandName}`);

    console.log("Usage:");
    Object.entries(commands).map(([name, command]) => {
        printCommandUsage(name, command);
    });

    process.exit(1);
}

const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: command.options || {},
    strict: true,
    allowPositionals: true,
});

const args = positionals.slice(3);

if (command.args) {
    if (args.length !== command.args.length) {
        console.log(`Expected ${command.args.length} arguments, got ${args.length}`);

        console.log("Usage:");
        printCommandUsage(commandName, command);

        process.exit(1);
    }
}

Object.entries(command.options || {}).forEach(([key, option]) => {
    if (option.default !== undefined) {
        values[key] = values[key] || option.default;
        return;
    }
    if (values[key] === undefined) {
        console.log(`Missing required option: ${key}`);

        console.log("Usage:");
        printCommandUsage(commandName, command);

        process.exit(1);
    }
});

if (!command.isAuthAction) {
    if (!account.session) {
        console.log("You need to login first");
        process.exit(1);
    }

    await account.loadPrimaryKeys();
}

await command.action({
    account,
    sdk,
    fileSystem,
    args,
    options: values,
});

process.exit()
