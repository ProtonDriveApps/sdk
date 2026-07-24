import { ParseArgsConfig } from 'util';

import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { type ActionArgs, type Command, printIterable } from '../../cli';
import { printPhotoHuman } from './printPhotoHuman';

export class CommandAlbumPhotos implements Command {
    group = 'album';
    name = 'photos';
    args = ['albumPath'];
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

        if (loadDetails) {
            await this.listWithDetails(photosSdk, node.uid, json);
        } else {
            await this.list(photosSdk, node.uid, json);
        }
    }

    async list(photosSdk: ProtonDrivePhotosClient, albumNodeUid: string, json: boolean) {
        await printIterable(photosSdk.iterateAlbum(albumNodeUid), json, (item) => console.log(item.nodeUid));
    }

    async listWithDetails(photosSdk: ProtonDrivePhotosClient, albumNodeUid: string, json: boolean) {
        const nodeUids = await Array.fromAsync(photosSdk.iterateAlbum(albumNodeUid), (photo) => photo.nodeUid);
        await printIterable(photosSdk.iterateNodes(nodeUids), json, (node) => 'missingUid' in node ? undefined : printPhotoHuman(node));
    }
}
