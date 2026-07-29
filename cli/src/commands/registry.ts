import { applyDefaultCliOptions } from '../cli';
import { CommandAuthLogin } from './auth/commandAuthLogin';
import { CommandAuthLogout } from './auth/commandAuthLogout';
import { CommandFileSystemCopy } from './fileSystem/commandFileSystemCopy';
import { CommandFileSystemCreateFolder } from './fileSystem/commandFileSystemCreateFolder';
import { CommandFileSystemDelete } from './fileSystem/commandFileSystemDelete';
import { CommandFileSystemDownload } from './fileSystem/commandFileSystemDownload';
import { CommandFileSystemEmptyTrash } from './fileSystem/commandFileSystemEmptyTrash';
import { CommandFileSystemInfo } from './fileSystem/commandFileSystemInfo';
import { CommandFileSystemList } from './fileSystem/commandFileSystemList';
import { CommandFileSystemMove } from './fileSystem/commandFileSystemMove';
import { CommandFileSystemRename } from './fileSystem/commandFileSystemRename';
import { CommandFileSystemRestore } from './fileSystem/commandFileSystemRestore';
import { CommandFileSystemTrash } from './fileSystem/commandFileSystemTrash';
import { CommandFileSystemUpload } from './fileSystem/commandFileSystemUpload';
import { CommandAlbumAddPhoto } from './photos/commandAlbumAddPhoto';
import { CommandAlbumCreate } from './photos/commandAlbumCreate';
import { CommandAlbumDelete } from './photos/commandAlbumDelete';
import { CommandAlbumList } from './photos/commandAlbumList';
import { CommandAlbumPhotos } from './photos/commandAlbumPhotos';
import { CommandAlbumRemovePhoto } from './photos/commandAlbumRemovePhoto';
import { CommandAlbumUpdate } from './photos/commandAlbumUpdate';
import { CommandPhotoDownload } from './photos/commandPhotoDownload';
import { CommandPhotoTimeline } from './photos/commandPhotoTimeline';
import { CommandPhotoUpload } from './photos/commandPhotoUpload';
import { CommandInvitationAccept } from './sharing/commandInvitationAccept';
import { CommandInvitationList } from './sharing/commandInvitationList';
import { CommandInvitationReject } from './sharing/commandInvitationReject';
import { CommandSharingInvite } from './sharing/commandSharingInvite';
import { CommandSharingLeave } from './sharing/commandSharingLeave';
import { CommandSharingRemove } from './sharing/commandSharingRemove';
import { CommandSharingRemoveUrl } from './sharing/commandSharingRemoveUrl';
import { CommandSharingSetUrl } from './sharing/commandSharingSetUrl';
import { CommandSharingStatus } from './sharing/commandSharingStatus';

export const COMMANDS = applyDefaultCliOptions([
    new CommandAuthLogin(),
    new CommandAuthLogout(),

    // Regular Drive commands
    new CommandFileSystemList(),
    new CommandFileSystemInfo(),
    new CommandFileSystemCreateFolder(),
    new CommandFileSystemUpload(),
    new CommandFileSystemDownload(),
    new CommandFileSystemRename(),
    new CommandFileSystemCopy(),
    new CommandFileSystemMove(),
    new CommandFileSystemTrash(),
    new CommandFileSystemRestore(),
    new CommandFileSystemDelete(),
    new CommandFileSystemEmptyTrash(),
    new CommandSharingStatus(),
    new CommandSharingInvite(),
    new CommandSharingLeave(),
    new CommandSharingRemove(),
    new CommandSharingSetUrl(),
    new CommandSharingRemoveUrl(),
    new CommandInvitationList(),
    new CommandInvitationAccept(),
    new CommandInvitationReject(),

    // Photos commands
    new CommandAlbumList(),
    new CommandAlbumCreate(),
    new CommandAlbumUpdate(),
    new CommandAlbumDelete(),
    new CommandAlbumPhotos(),
    new CommandAlbumAddPhoto(),
    new CommandAlbumRemovePhoto(),
    new CommandPhotoTimeline(),
    new CommandPhotoUpload(),
    new CommandPhotoDownload(),
]);
