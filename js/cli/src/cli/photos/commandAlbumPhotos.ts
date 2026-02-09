import { ParseArgsConfig } from 'util';

import { ProtonDrivePhotosClient } from '../../../../sdk/src/protonDrivePhotosClient';
import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandAlbumPhotos implements Command {
    group = 'albums';
    name = 'photos';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        'load-details': {
            type: 'boolean',
            short: 'd',
            default: false,
        },
    };

    async action({ paths, photosSdk, args: [pathString], options: { json, 'load-details': loadDetails } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        const albumUid = node.ok ? node.value.uid : node.error.uid;

        if (loadDetails) {
            await this.listWithDetails(photosSdk, albumUid, json);
        } else {
            await this.list(photosSdk, albumUid, json);
        }
    }

    async list(photosSdk: ProtonDrivePhotosClient, albumNodeUid: string, json: boolean) {
        await printIterable(photosSdk.iterateAlbum(albumNodeUid), json);
    }

    async listWithDetails(photosSdk: ProtonDrivePhotosClient, albumNodeUid: string, json: boolean) {
        const nodeUids = await Array.fromAsync(photosSdk.iterateAlbum(albumNodeUid), (photo) => photo.nodeUid);
        await printIterable(photosSdk.iterateNodes(nodeUids), json);
    }
}
