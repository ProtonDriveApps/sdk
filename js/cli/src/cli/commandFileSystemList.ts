import { ParseArgsConfig } from 'node:util';

import { ProtonDriveClient, MaybeNode, Device, NodeType } from '../../../sdk/src';
import { Command, ActionArgs } from './interface';
import { PathType, Path } from './paths';
import { formatAuthor, formatDate, formatSize, formatMemberRole, printIterable } from './formatters';
import { getName, getClaimedSize, getNode } from './node';

export class CommandFileSystemList implements Command {
    group = 'filesystem';
    name = 'list';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        type: {
            type: 'string',
            short: 't',
            default: '',
        },
    };

    async action({ sdk, paths, args: [pathString], options: { json, type } }: ActionArgs) {
        const path = paths.getPath(pathString);

        const nodeType = type ? Object.entries(NodeType).find(([, value]) => value === type)?.[1] : undefined;
        if (type && !nodeType) {
            throw new Error(`Invalid node type: ${type}`);
        }

        if (path.type === PathType.Root) {
            if (json) {
                throw new Error('Cannot use --json option with root path');
            }
            paths.rootPaths.forEach((path) => console.log(path));
        } else if (path.type === PathType.MyFiles) {
            await this.printChildren(sdk, path, { json, nodeType });
        } else if (path.type === PathType.Devices) {
            if (path.fullPath === '/devices') {
                await this.printDevices(sdk, { json });
            } else {
                await this.printChildren(sdk, path, { json });
            }
        } else if (path.type === PathType.SharedByMe) {
            await this.printSharedNodes(sdk, { json });
        } else if (path.type === PathType.SharedWithMe) {
            if (path.fullPath === '/shared-with-me') {
                await this.printSharedWithMe(sdk, { json });
            } else {
                await this.printChildren(sdk, path, { json });
            }
        } else if (path.type === PathType.Trash) {
            await this.printTrashedNodes(sdk, { json });
        }
    }

    private async printDevices(sdk: ProtonDriveClient, options: { json: boolean }) {
        await printIterable(sdk.iterateDevices(), options.json, (device) => this.printDeviceHuman(device));
    }

    private async printChildren(sdk: ProtonDriveClient, path: Path, options: { json: boolean; nodeType?: NodeType }) {
        const parentNode = await path.getNode();
        const filterOptions = options.nodeType ? { type: options.nodeType } : undefined;
        const childrenIterator = sdk.iterateFolderChildren(parentNode, filterOptions);
        await printIterable(childrenIterator, options.json, (node) => this.printNodeHuman(node));
    }

    private async printSharedNodes(sdk: ProtonDriveClient, options: { json: boolean }) {
        await printIterable(sdk.iterateSharedNodes(), options.json, (node) => this.printNodeHuman(node));
    }

    private async printSharedWithMe(sdk: ProtonDriveClient, options: { json: boolean }) {
        await printIterable(sdk.iterateSharedNodesWithMe(), options.json, (node) => this.printNodeHuman(node));
    }

    private async printTrashedNodes(sdk: ProtonDriveClient, options: { json: boolean }) {
        await printIterable(sdk.iterateTrashedNodes(), options.json, (node) => this.printNodeHuman(node));
    }

    private printNodeHuman(maybeNode: MaybeNode): void {
        const node = getNode(maybeNode);

        const type = node.type === 'file' ? '📄' : '🗂️';
        const sharedFlag = node.isShared ? '🔗' : '  '; // Two spaces to align with the shared icon.
        const permissionFlag = formatMemberRole(node.directRole);
        const author = formatAuthor(node.keyAuthor);
        const created = formatDate(node.creationTime, true);
        const claimedSize = getClaimedSize(maybeNode);
        const size = claimedSize ? formatSize(claimedSize) : '-';
        const id = node.uid.split('~')[1];
        const name = getName(maybeNode);
        console.log(`${type}${sharedFlag}${permissionFlag} ${author} ${created} ${size} ${id} ${name}`);
    }

    private printDeviceHuman(device: Device): void {
        console.log(`${device.type} ${device.name.ok ? device.name.value : device.name.error.name}`);
    }
}
