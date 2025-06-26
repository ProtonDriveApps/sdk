import { ParseArgsConfig } from "util";
import { CommandAuthLogin } from './commandAuthLogin';
import { CommandAuthLogout } from './commandAuthLogout';
import { CommandDeviceCreate } from './commandDeviceCreate';
import { CommandDeviceDelete } from './commandDeviceDelete';
import { CommandDeviceRename } from './commandDeviceRename';
import { CommandEventFolder } from './commandEventFolder';
import { CommandEventSharedByMe } from './commandEventSharedByMe';
import { CommandEventSharedWithMe } from './commandEventSharedWithMe';
import { CommandEventSync } from "./commandEventSync";
import { CommandEventTrash } from './commandEventTrash';
import { CommandFileSystemCreateFolder } from './commandFileSystemCreateFolder';
import { CommandFileSystemDelete } from "./commandFileSystemDelete";
import { CommandFileSystemDownload } from './commandFileSystemDownload';
import { CommandFileSystemDownloadThumbnails } from './commandFileSystemDownloadThumbnails';
import { CommandFileSystemInfo } from './commandFileSystemInfo';
import { CommandFileSystemList } from './commandFileSystemList';
import { CommandFileSystemMove } from './commandFileSystemMove';
import { CommandFileSystemRename } from './commandFileSystemRename';
import { CommandFileSystemRestore } from './commandFileSystemRestore';
import { CommandFileSystemUpload } from './commandFileSystemUpload';
import { CommandFileSystemTrash } from './commandFileSystemTrash';
import { CommandInvitationList } from "./commandInvitationList";
import { CommandRevisionDelete } from './commandRevisionDelete';
import { CommandRevisionDownload } from './commandRevisionDownload';
import { CommandRevisionList } from './commandRevisionList';
import { CommandRevisionRestore } from './commandRevisionRestore';
import { CommandSharingInvite } from "./commandSharingInvite";
import { CommandSharingRemove } from "./commandSharingRemove";
import { CommandSharingRemoveUrl } from "./commandSharingRemoveUrl";
import { CommandSharingSetUrl } from "./commandSharingSetUrl";
import { CommandSharingStatus } from "./commandSharingStatus";
import { Command } from './interface';

const COMMANDS = [
    new CommandAuthLogin(),
    new CommandAuthLogout(),
    new CommandEventSync(),
    new CommandEventFolder(),
    new CommandEventTrash(),
    new CommandEventSharedByMe(),
    new CommandEventSharedWithMe(),
    new CommandFileSystemList(),
    new CommandFileSystemInfo(),
    new CommandFileSystemCreateFolder(),
    new CommandFileSystemRename(),
    new CommandFileSystemMove(),
    new CommandFileSystemTrash(),
    new CommandFileSystemDelete(),
    new CommandFileSystemRestore(),
    new CommandFileSystemDownload(),
    new CommandFileSystemDownloadThumbnails(),
    new CommandFileSystemUpload(),
    new CommandRevisionList(),
    new CommandRevisionDownload(),
    new CommandRevisionRestore(),
    new CommandRevisionDelete(),
    new CommandSharingStatus(),
    new CommandSharingInvite(),
    new CommandSharingRemove(),
    new CommandSharingSetUrl(),
    new CommandSharingRemoveUrl(),
    new CommandInvitationList(),
    new CommandDeviceCreate(),
    new CommandDeviceRename(),
    new CommandDeviceDelete(),
].map((command: Command) => {
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
    return command;
});

export function getCommand(groupName: string, commandName: string): Command {
    if (groupName === 'fs') {
        groupName = 'filesystem';
    }

    let commands = COMMANDS.filter(command => command.group.startsWith(groupName) && command.name === commandName);
    if (commands.length === 1) {
        return commands[0];
    }

    commands = COMMANDS.filter(command => command.group.startsWith(groupName) && command.name.startsWith(commandName));
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
    console.log("General options:");
    console.log("  --help: Show this help");
    console.log("  -j, --json: Output in JSON format");
}

function printCommandUsage(command: Command) {
    console.log("Usage:");
    printCommandManual(command);
}

function printCommandManual(command: Command) {
    const args = (command.args || []).map(arg => `<${arg}>`).join(' ');
    const options = Object.entries(command.options || {})
        .filter(([name]) => name !== 'help' && name !== 'json')
        .map(([name, { type, short }]) => {
            const flag = short ? `-${short}|--${name}` : `--${name}`;
            return type === 'boolean' ? flag : `${flag} <${type}>`
        })
        .join(' ');
    console.log(`  ${command.group} ${command.name} ${args} ${options}`);
}
