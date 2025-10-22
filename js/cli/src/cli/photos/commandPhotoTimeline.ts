import { ParseArgsConfig } from 'util';

import { ProtonDrivePhotosClient } from '../../../../sdk/src/protonDrivePhotosClient';
import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandPhotoTimeline implements Command {
    group = 'photo';
    name = 'timeline';
    options: ParseArgsConfig['options'] = {
        loadDetails: {
            type: 'boolean',
            short: 'd',
            default: false,
        },
    };

    async action({ photosSdk, options: { json, loadDetails } }: ActionArgs) {
        if (loadDetails) {
            await this.listWithDetails(photosSdk, json);
        } else {
            await this.list(photosSdk, json);
        }
    }

    async list(photosSdk: ProtonDrivePhotosClient, json: boolean) {
        await printIterable(photosSdk.iterateTimeline(), json);
    }

    async listWithDetails(photosSdk: ProtonDrivePhotosClient, json: boolean) {
        const nodeUids = await Array.fromAsync(photosSdk.iterateTimeline(), (photo) => photo.nodeUid);
        await printIterable(photosSdk.iterateNodes(nodeUids), json);
    }
}
