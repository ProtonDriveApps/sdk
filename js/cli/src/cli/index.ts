import { ParseArgsConfig } from "util";
import { CommandAuthLogin } from './commandAuthLogin';
import { CommandFileSystemCreateFolder } from './commandFileSystemCreateFolder';
import { CommandFileSystemInfo } from './commandFileSystemInfo';
import { CommandFileSystemList } from './commandFileSystemList';
import { CommandFileSystemMove } from './commandFileSystemMove';
import { CommandFileSystemRename } from './commandFileSystemRename';
import { CommandFileSystemRestore } from './commandFileSystemRestore';
import { CommandFileSystemTrash } from './commandFileSystemTrash';
import { CommandInvitationList } from "./commandInvitationList";
import { CommandRevisionDelete } from './commandRevisionDelete';
import { CommandRevisionList } from './commandRevisionList';
import { CommandRevisionRestore } from './commandRevisionRestore';
import { CommandSharingStatus } from "./commandSharingStatus";
import { CommandSharingInvite } from "./commandSharingInvite";
import { CommandSharingRemove } from "./commandSharingRemove";
import { Command } from './interface';
import { CommandFileSystemDelete } from "./commandFileSystemDelete";

const COMMANDS = [
    new CommandAuthLogin(),
    new CommandFileSystemList(),
    new CommandFileSystemInfo(),
    new CommandFileSystemCreateFolder(),
    new CommandFileSystemRename(),
    new CommandFileSystemMove(),
    new CommandFileSystemTrash(),
    new CommandFileSystemDelete(),
    new CommandFileSystemRestore(),
    new CommandRevisionList(),
    new CommandRevisionRestore(),
    new CommandRevisionDelete(),
    new CommandSharingStatus(),
    new CommandSharingInvite(),
    new CommandSharingRemove(),
    new CommandInvitationList(),

];

export function getCommand(groupName: string, commandName: string): Command {
    if (groupName === 'fs') {
        groupName = 'filesystem';
    }

    const commands = COMMANDS.filter(command => command.group.startsWith(groupName) && command.name.startsWith(commandName));
    if (commands.length === 1) {
        return commands[0];
    }

    printUsage();
    throw new Error(`Command not found`);
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
    const options = Object.entries(command.options || {})
        .map(([name, { type }]) => type === 'boolean' ? `--${name}` : `--${name} <${type}>`)
        .join(' ');
    console.log(`  ${command.group} ${command.name} ${args} ${options}`);
}
