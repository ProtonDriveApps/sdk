import { ParseArgsConfig } from 'util';

import { CommandNotFoundError, InvalidCommandArgumentsError } from './errors';
import { Command } from './interface';

export function applyDefaultCliOptions(commands: Command[]): Command[] {
    for (const command of commands) {
        command.options = command.options || {};
        command.options['help'] = {
            type: 'boolean',
            default: false,
        };
        command.options['json'] = {
            type: 'boolean',
            short: 'j',
            default: false,
        };
    }
    return commands;
}

export function getCommand(commands: Command[], groupName: string, commandName: string): Command {
    if (groupName === 'help') {
        return new CommandHelp(commands);
    }

    if (groupName === 'fs') {
        groupName = 'filesystem';
    }

    let matches = commands.filter((command) => command.group.startsWith(groupName) && command.name === commandName);
    if (matches.length === 1) {
        return matches[0];
    }

    matches = commands.filter(
        (command) => command.group.startsWith(groupName) && command.name.startsWith(commandName),
    );
    if (matches.length === 1) {
        return matches[0];
    }

    printUsage(commands);
    throw new CommandNotFoundError();
}

export function validateCommandArguments(command: Command, args: string[], values: { [name: string]: unknown }) {
    // Do not validate arguments when help is requested.
    if (values['help']) {
        return;
    }

    if (command.args) {
        if (args.length !== command.args.length) {
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

function printUsage(commands: Command[]) {
    console.log('Usage:');
    commands.map((command) => {
        printCommandManual(command);
    });
    console.log('General options:');
    console.log('  --help: Show help for a command');
    console.log('  -j, --json: Output in JSON format');
}

export function printCommandUsage(command: Command) {
    console.log('Usage:');
    printCommandManual(command);
}

function printCommandManual(command: Command) {
    const args = (command.args || []).map((arg) => `<${arg}>`).join(' ');
    const options = Object.entries(command.options || {})
        .filter(([name]) => name !== 'help' && name !== 'json')
        .map(([name, { type, short }]) => {
            const flag = short ? `-${short}|--${name}` : `--${name}`;
            return type === 'boolean' ? flag : `${flag} <${type}>`;
        })
        .join(' ');
    console.log(`  ${command.group} ${command.name} ${args} ${options}`);
}
