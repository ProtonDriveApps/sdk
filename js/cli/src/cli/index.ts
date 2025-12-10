import { ParseArgsConfig } from 'util';

import { CommandAuthLogin } from './auth/commandAuthLogin';
import { CommandAuthLogout } from './auth/commandAuthLogout';
import { CommandBookmarkRemove } from './bookmark/commandBookmarkRemove';
import { CommandBookmarkList } from './bookmark/commandBookmarkList';
import { CommandDeviceCreate } from './device/commandDeviceCreate';
import { CommandDeviceDelete } from './device/commandDeviceDelete';
import { CommandDeviceRename } from './device/commandDeviceRename';
import { CommandDiagnosticPhotosTimeline } from './diagnostic/commandDiagnosticPhotosTimeline';
import { CommandDiagnosticTree } from './diagnostic/commandDiagnosticTree';
import { CommandEventsDrive } from './events/commandEventsDrive';
import { CommandEventsMyVolume } from './events/commandEventsMyVolume';
import { CommandEventsPath } from './events/commandEventsPath';
import { CommandFileSystemCopy } from './fileSystem/commandFileSystemCopy';
import { CommandFileSystemCreateFolder } from './fileSystem/commandFileSystemCreateFolder';
import { CommandFileSystemDelete } from './fileSystem/commandFileSystemDelete';
import { CommandFileSystemDownload } from './fileSystem/commandFileSystemDownload';
import { CommandFileSystemDownloadSeeking } from './fileSystem/commandFileSystemDownloadSeeking';
import { CommandFileSystemDownloadThumbnails } from './fileSystem/commandFileSystemDownloadThumbnails';
import { CommandFileSystemGetAvailableName } from './fileSystem/commandFileSystemGetAvailableName';
import { CommandFileSystemInfo } from './fileSystem/commandFileSystemInfo';
import { CommandFileSystemList } from './fileSystem/commandFileSystemList';
import { CommandFileSystemMove } from './fileSystem/commandFileSystemMove';
import { CommandFileSystemRename } from './fileSystem/commandFileSystemRename';
import { CommandFileSystemRestore } from './fileSystem/commandFileSystemRestore';
import { CommandFileSystemUpload } from './fileSystem/commandFileSystemUpload';
import { CommandFileSystemTrash } from './fileSystem/commandFileSystemTrash';
import { CommandAlbumList } from './photos/commandAlbumList';
import { CommandPhotoDuplicate } from './photos/commandPhotoDuplicate';
import { CommandPhotoRoot } from './photos/commandPhotoRoot';
import { CommandPhotoTimeline } from './photos/commandPhotoTimeline';
import { CommandPublicCreateFolder } from './public/commandPublicCreateFolder';
import { CommandPublicDelete } from './public/commandPublicDelete';
import { CommandPublicDownload } from './public/commandPublicDownload';
import { CommandPublicDownloadThumbnails } from './public/commandPublicDownloadThumbnails';
import { CommandPublicInfo } from './public/commandPublicInfo';
import { CommandPublicList } from './public/commandPublicList';
import { CommandPublicRename } from './public/commandPublicRename';
import { CommandPublicUpload } from './public/commandPublicUpload';
import { CommandRevisionDelete } from './revision/commandRevisionDelete';
import { CommandRevisionDownload } from './revision/commandRevisionDownload';
import { CommandRevisionList } from './revision/commandRevisionList';
import { CommandRevisionRestore } from './revision/commandRevisionRestore';
import { CommandSharingInvite } from './sharing/commandSharingInvite';
import { CommandSharingRemove } from './sharing/commandSharingRemove';
import { CommandSharingRemoveUrl } from './sharing/commandSharingRemoveUrl';
import { CommandSharingSetUrl } from './sharing/commandSharingSetUrl';
import { CommandSharingStatus } from './sharing/commandSharingStatus';
import { CommandInvitationAccept } from './sharing/commandInvitationAccept';
import { CommandInvitationList } from './sharing/commandInvitationList';
import { CommandInvitationReject } from './sharing/commandInvitationReject';
import { Command } from './interface';

const COMMANDS = [
    // CLI Account
    new CommandAuthLogin(),
    new CommandAuthLogout(),
    // ProtonDriveClient
    new CommandEventsDrive(),
    new CommandEventsMyVolume(),
    new CommandEventsPath(),
    new CommandFileSystemList(),
    new CommandFileSystemInfo(),
    new CommandFileSystemCreateFolder(),
    new CommandFileSystemRename(),
    new CommandFileSystemMove(),
    new CommandFileSystemCopy(),
    new CommandFileSystemTrash(),
    new CommandFileSystemDelete(),
    new CommandFileSystemRestore(),
    new CommandFileSystemDownload(),
    new CommandFileSystemDownloadSeeking(),
    new CommandFileSystemDownloadThumbnails(),
    new CommandFileSystemUpload(),
    new CommandFileSystemGetAvailableName(),
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
    new CommandInvitationAccept(),
    new CommandInvitationReject(),
    new CommandBookmarkList(),
    new CommandBookmarkRemove(),
    new CommandDeviceCreate(),
    new CommandDeviceRename(),
    new CommandDeviceDelete(),
    // ProtonDrivePublicLinkClient
    new CommandPublicList(),
    new CommandPublicInfo(),
    new CommandPublicCreateFolder(),
    new CommandPublicRename(),
    new CommandPublicDelete(),
    new CommandPublicDownload(),
    new CommandPublicDownloadThumbnails(),
    new CommandPublicUpload(),
    // ProtonDrivePhotosClient
    new CommandPhotoRoot(),
    new CommandPhotoTimeline(),
    new CommandPhotoDuplicate(),
    new CommandAlbumList(),
    // Diagnostic
    new CommandDiagnosticTree(),
    new CommandDiagnosticPhotosTimeline(),
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

    let commands = COMMANDS.filter((command) => command.group.startsWith(groupName) && command.name === commandName);
    if (commands.length === 1) {
        return commands[0];
    }

    commands = COMMANDS.filter(
        (command) => command.group.startsWith(groupName) && command.name.startsWith(commandName),
    );
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

    Object.entries((command.options as ParseArgsConfig['options']) || {}).forEach(([key, option]) => {
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
    console.log('Usage:');
    COMMANDS.map((command) => {
        printCommandManual(command);
    });
    console.log('General options:');
    console.log('  --help: Show this help');
    console.log('  -j, --json: Output in JSON format');
}

function printCommandUsage(command: Command) {
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
