import { parseArgs, ParseArgsConfig } from 'util';

import { InitConfig } from '../config';
import { CommandNotFoundError, InvalidCommandArgumentsError } from './errors';
import { printCommandUsage, printUsage } from './help';
import { Command } from './interface';

export function applyDefaultCliOptions(commands: Command[]): Command[] {
    for (const command of commands) {
        command.options = command.options || {};
        command.options['help'] = {
            type: 'boolean',
            short: 'h',
            default: false,
        };
        command.options['json'] = {
            type: 'boolean',
            short: 'j',
            default: false,
        };
        command.options['verbose'] = {
            type: 'boolean',
            short: 'v',
            default: false,
        };
    }
    return commands;
}

export function getCommand(
    commands: Command[],
    groupName: string,
    commandName: string,
    initOptions: InitConfig,
): Command {
    if (groupName === 'help' || groupName === '--help' || groupName === '-h') {
        return new CommandHelp(commands);
    }
    if (groupName === 'version' || groupName === '--version' || groupName === '-v') {
        return new CommandVersion(initOptions);
    }

    if (groupName === 'fs') {
        groupName = 'filesystem';
    }

    let matches = commands.filter((command) => command.group.startsWith(groupName) && command.name === commandName);
    if (matches.length === 1) {
        return matches[0];
    }

    matches = commands.filter((command) => command.group.startsWith(groupName) && command.name.startsWith(commandName));
    if (matches.length === 1) {
        return matches[0];
    }

    printUsage(commands);
    throw new CommandNotFoundError(`Command not found: ${groupName} ${commandName}`);
}

export function getCommandArguments(
    command: Command,
    argv: string[],
): { options: { [name: string]: unknown }; args: string[] } {
    if (command instanceof CommandHelp || command instanceof CommandVersion) {
        return { options: {}, args: [] };
    }

    try {
        const { values: options, positionals } = parseArgs({
            args: argv,
            options: command.options || {},
            strict: true,
            allowPositionals: true,
        });
        const args = positionals.slice(4);
        validateCommandArguments(command, args, options);
        return { options, args };
    } catch (error) {
        if (error instanceof InvalidCommandArgumentsError) {
            throw error;
        }
        if (error instanceof TypeError) {
            printCommandUsage(command);
            throw new InvalidCommandArgumentsError(error.message);
        }
        throw error;
    }
}

function validateCommandArguments(command: Command, args: string[], values: { [name: string]: unknown }) {
    if (values['help']) {
        return;
    }

    if (command.args) {
        const hasVariableArgs = command.args.some((arg) => arg.endsWith('...'));
        const hasExpectedArgs = hasVariableArgs
            ? args.length >= command.args.length
            : args.length === command.args.length;
        if (!hasExpectedArgs) {
            printCommandUsage(command);
            throw new InvalidCommandArgumentsError(`Expected ${command.args.length} arguments, got ${args.length}`);
        }
    }

    Object.entries((command.options as ParseArgsConfig['options']) || {}).forEach(([key, option]) => {
        if (option.default !== undefined) {
            values[key] = values[key] || option.default;
            return;
        }
        if (values[key] === undefined) {
            printCommandUsage(command);
            throw new InvalidCommandArgumentsError(`Missing required option: ${key}`);
        }
    });
}

class CommandHelp implements Command {
    group = 'help';
    name = 'help';
    isAuthAction = true;

    constructor(private commands: Command[]) {}

    async action() {
        printUsage(this.commands);
    }
}

class CommandVersion implements Command {
    group = 'version';
    name = 'version';
    isAuthAction = true;

    constructor(private initOptions: InitConfig) {}

    async action() {
        console.log(`Proton Drive CLI ${this.initOptions.appVersion}`);
        console.log(`Proton Drive SDK ${this.initOptions.sdkVersion}`);
    }
}
