import { ParseArgsConfig } from 'util';

import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { type ActionArgs, type Command, printIterable } from '../../cli';
import { printPhotoHuman } from './printPhotoHuman';

export class CommandPhotoTimeline implements Command {
    group = 'photo';
    name = 'timeline';
    options: ParseArgsConfig['options'] = {
        'load-details': {
            type: 'boolean',
            short: 'd',
            default: false,
        },
    };

    async action({ photosSdk, options: { json, 'load-details': loadDetails } }: ActionArgs) {
        if (loadDetails) {
            await this.listWithDetails(photosSdk, json);
        } else {
            await this.list(photosSdk, json);
        }
    }

    async list(photosSdk: ProtonDrivePhotosClient, json: boolean) {
        await printIterable(photosSdk.iterateTimeline(), json, (item) => console.log(item.nodeUid));
    }

    async listWithDetails(photosSdk: ProtonDrivePhotosClient, json: boolean) {
        const nodeUids = await Array.fromAsync(photosSdk.iterateTimeline(), (photo) => photo.nodeUid);
        await printIterable(photosSdk.iterateNodes(nodeUids), json, (node) => 'missingUid' in node ? undefined : printPhotoHuman(node));
    }
}
