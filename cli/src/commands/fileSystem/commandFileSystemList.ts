import { Device, NodeEntity, NodeType, ProtonDriveClient, ValidationError } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import {
    type ActionArgs,
    type Command,
    formatAuthor,
    formatDate,
    formatMemberRole,
    formatSize,
    getClaimedSize,
    getName,
    Options,
    Paths,
    PathType,
    printIterable,
    sanitizeTerminalText,
} from '../../cli';

export class CommandFileSystemList implements Command {
    group = 'filesystem';
    name = 'list';
    help = 'Use / to list top-level sections. Your root folder is /my-files.';
    args = ['path'];
    options: Options = {
        type: {
            type: 'string',
            short: 't',
            default: '',
            allowedValues: Object.values(NodeType),
            help: 'Type of the node to filter by.',
        },
    };

    async action({ sdk, photosSdk, paths, args: [pathString], options: { json, type } }: ActionArgs) {
        const path = paths.getPath(pathString);

        const nodeType = type ? Object.entries(NodeType).find(([, value]) => value === type)?.[1] : undefined;
        if (type && !nodeType) {
            throw new ValidationError(`Invalid node type: ${type}`);
        }

        switch (path.type) {
            case PathType.Root:
                const rootPaths = paths.rootPaths.map((path) => ({ path }));
                await printIterable(rootPaths, json, (item) => console.log(sanitizeTerminalText(item.path)));
                break;
            case PathType.MyFiles:
                await this.printChildren(sdk, paths, pathString, { json, nodeType });
                break;
            case PathType.Devices:
                if (path.fullPath === `/${PathType.Devices}`) {
                    await this.printDevices(sdk, { json });
                } else {
                    await this.printChildren(sdk, paths, pathString, { json });
                }
                break;
            case PathType.SharedByMe:
                if (path.fullPath === `/${PathType.SharedByMe}`) {
                    await this.printSharedNodes(sdk, { json });
                } else {
                    throw new ValidationError(`Use direct path to list children of shared node`);
                }
                break;
            case PathType.SharedWithMe:
                if (path.fullPath === `/${PathType.SharedWithMe}`) {
                    await this.printSharedWithMe(sdk, { json });
                } else {
                    await this.printChildren(sdk, paths, pathString, { json });
                }
                break;
            case PathType.Trash:
                if (path.fullPath === `/${PathType.Trash}`) {
                    await this.printTrashedNodes(sdk, { json });
                } else {
                    throw new ValidationError(`Listing children of trashed folder is not supported`);
                }
                break;
            case PathType.PhotosSharedByMe:
                if (path.fullPath === `/${PathType.PhotosSharedByMe}`) {
                    await this.printSharedNodes(photosSdk, { json });
                } else {
                    throw new ValidationError(`Use direct path to list children of shared node`);
                }
                break;
            case PathType.PhotosSharedWithMe:
                if (path.fullPath === `/${PathType.PhotosSharedWithMe}`) {
                    await this.printSharedWithMe(photosSdk, { json });
                } else {
                    throw new ValidationError(`Use albums photos command to list photos in shared albums`);
                }
                break;
            case PathType.PhotosTrash:
                if (path.fullPath === `/${PathType.PhotosTrash}`) {
                    await this.printTrashedNodes(photosSdk, { json });
                } else {
                    throw new ValidationError(`Listing photos of trashed albums is not supported`);
                }
                break;
            default:
                throw new ValidationError(`Path type ${path.type} is not supported`);
        }
    }

    private async printDevices(sdk: ProtonDriveClient, options: { json: boolean }) {
        await printIterable(sdk.iterateDevices(), options.json, (device) => this.printDeviceHuman(device));
    }

    private async printChildren(
        sdk: ProtonDriveClient,
        paths: Paths,
        pathString: string,
        options: { json: boolean; nodeType?: NodeType },
    ) {
        const parentNode = await paths.getNode(pathString);
        const filterOptions = options.nodeType ? { type: options.nodeType } : undefined;
        const childrenIterator = sdk.iterateFolderChildren(parentNode, filterOptions);
        await printIterable(childrenIterator, options.json, (node) => this.printNodeHuman(node));
    }

    private async printSharedNodes(sdk: ProtonDriveClient | ProtonDrivePhotosClient, options: { json: boolean }) {
        await printIterable(sdk.iterateSharedNodes(), options.json, (node) => this.printNodeHuman(node));
    }

    private async printSharedWithMe(sdk: ProtonDriveClient | ProtonDrivePhotosClient, options: { json: boolean }) {
        await printIterable(sdk.iterateSharedNodesWithMe(), options.json, (node) => this.printNodeHuman(node));
    }

    private async printTrashedNodes(sdk: ProtonDriveClient | ProtonDrivePhotosClient, options: { json: boolean }) {
        await printIterable(sdk.iterateTrashedNodes(), options.json, (node) => this.printNodeHuman(node));
    }

    private printNodeHuman(node: NodeEntity): void {
        const type = node.type === 'file' ? '📄' : '🗂️';
        const sharedFlag = node.isShared ? '🔗' : '  '; // Two spaces to align with the shared icon.
        const permissionFlag = formatMemberRole(node.directRole);
        const author = formatAuthor(node.keyAuthor);
        const created = formatDate(node.creationTime, true);
        const claimedSize = getClaimedSize(node);
        const size = claimedSize ? formatSize(claimedSize) : '-';
        const name = getName(node);
        console.log(sanitizeTerminalText(`${type}${sharedFlag}${permissionFlag} ${author} ${created} ${size} ${name}`));
    }

    private printDeviceHuman(device: Device): void {
        console.log(
            sanitizeTerminalText(`${device.type} ${device.name.ok ? device.name.value : device.name.error.name}`),
        );
    }
}
