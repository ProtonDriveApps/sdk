import { ProtonDriveClient, MaybeNode, MemberRole, Device } from '../../../sdk/src';
import { Command, ActionArgs } from './interface';
import { PathType, Path } from './paths';
import { formatAuthor, formatDate, formatSize } from './formatters';
import { getName, getClaimedSize, getNode } from './node';

export class CommandFileSystemList implements Command {
    group = 'filesystem';
    name = 'list';
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);

        if (path.type === PathType.Root) {
            if (json) {
                throw new Error('Cannot use --json option with root path');
            }
            paths.rootPaths.forEach((path) => console.log(path));
        } else if (path.type === PathType.MyFiles) {
            await this.printChildren(sdk, path, { json });
        } else if (path.type === PathType.Devices) {
            if (path.fullPath === '/devices') {
                for await (const device of sdk.iterateDevices()) {
                    this.printDevice(device, { json });
                }
            } else {
                await this.printChildren(sdk, path, { json });
            }
        } else if (path.type === PathType.SharedByMe) {
            for await (const node of sdk.iterateSharedNodes()) {
                this.printNode(node, { json });
            }
        } else if (path.type === PathType.SharedWithMe) {
            if (path.fullPath === '/shared-with-me') {
                for await (const node of sdk.iterateSharedNodesWithMe()) {
                    this.printNode(node, { json });
                }
            } else {
                await this.printChildren(sdk, path, { json });
            }
        } else if (path.type === PathType.Trash) {
            for await (const node of sdk.iterateTrashedNodes()) {
                this.printNode(node, { json });
            }
        }
    }

    private async printChildren(sdk: ProtonDriveClient, path: Path, options: { json: boolean }) {
        const parentNode = await path.getNode();
        for await (const node of sdk.iterateFolderChildren(parentNode)) {
            this.printNode(node, options);
        }
    }

    private printNode(maybeNode: MaybeNode, options: { json: boolean }) {
        if (options.json) {
            console.log(JSON.stringify(maybeNode));
            return;
        }
        const node = getNode(maybeNode);

        const type = node.type === 'file' ? '📄' : '🗂️';
        const sharedFlag = node.isShared ? '🔗' : '  '; // Two spaces to align with the shared icon.
        const permissionFlag = getPermissionFlag(node.directMemberRole);
        const author = formatAuthor(node.keyAuthor);
        const created = formatDate(node.creationTime, true);
        const claimedSize = getClaimedSize(maybeNode);
        const size = claimedSize ? formatSize(claimedSize) : '-';
        const id = node.uid.split('~')[1];
        const name = getName(maybeNode);
        console.log(`${type}${sharedFlag}${permissionFlag} ${author} ${created} ${size} ${id} ${name}`);
    }

    private printDevice(device: Device, options: { json: boolean }) {
        if (options.json) {
            console.log(JSON.stringify(device));
            return;
        }

        console.log(`${device.type} ${device.name.ok ? device.name.value : device.name.error.name}`);
    }
}

function getPermissionFlag(memberRole: MemberRole): string {
    switch (memberRole) {
        case MemberRole.Inherited:
            return '  '; // Two spaces to align with icon.
        case MemberRole.Viewer:
            return '👁 '; // Extra space due to how terminal render this.
        case MemberRole.Editor:
            return '📝';
        case MemberRole.Admin:
            return '👑';
    }
}
