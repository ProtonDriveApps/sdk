import { ParseArgsConfig } from "util";
import { CommandLogin } from './commandLogin';
import { CommandLs } from './commandLs';
import { CommandMkdir } from './commandMkdir';
import { CommandMv } from './commandMv';
import { CommandStat } from './commandStat';
import { Command } from './interface';
import { CommandInvitations } from "./commandInvitations";
import { CommandSharing } from "./commandSharing";
import { CommandShare } from "./commandShare";
import { CommandUnhare } from "./commandUnshare";

const COMMANDS = [
    new CommandLogin(),
    new CommandLs(),
    new CommandMkdir(),
    new CommandMv(),
    new CommandStat(),
    new CommandInvitations(),
    new CommandSharing(),
    new CommandShare(),
    new CommandUnhare(),
];

export function getCommand(commandName: string): Command {
    for (const command of COMMANDS) {
        if (command.name === commandName) {
            return command;
        }
    }

    printUsage();
    throw new Error(`Command not found: ${commandName}`);
}

export function validateCommandArguments(command: Command, args: string[], values: { [name: string]: any }) {
    if (command.args) {
        if (args.length !== command.args.length) {
            printCommandUsage(command);
            throw new Error(`Expected ${command.args.length} arguments, got ${args.length}`);
        }
    }

    Object.entries(command.options as ParseArgsConfig['options'] || {}).forEach(([key, option]) => {
        if (option.default !== undefined) {
            values[key] = values[key] || option.default;
            return;
        }
        if (values[key] === undefined) {
            printCommandUsage(command);
            throw new Error(`Missing required option: ${key}`);
        }
    });
}

function printUsage() {
    console.log("Usage:");
    COMMANDS.map((command) => {
        printCommandManual(command);
    });
}

function printCommandUsage(command: Command) {
    console.log("Usage:");
    printCommandManual(command);
}

function printCommandManual(command: Command) {
    const args = (command.args || []).map(arg => `<${arg}>`).join(' ');
    const options = Object.entries(command.options || {}).map(([name, { type }]) => `--${name} <${type}>`).join(' ');
    console.log(`  ${command.name} ${args} ${options}`);
}
