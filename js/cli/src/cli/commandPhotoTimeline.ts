import { ParseArgsConfig } from 'util';

import { ProtonDrivePhotosClient } from '../../../sdk/src/protonDrivePhotosClient';
import { formatReadableJson } from './formatters';
import { Command, ActionArgs } from './interface';

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
        for await (const photo of photosSdk.iterateTimeline()) {
            if (json) {
                console.log(JSON.stringify(photo));
            } else {
                console.log(formatReadableJson(photo));
            }
        }
    }

    async listWithDetails(photosSdk: ProtonDrivePhotosClient, json: boolean) {
        const nodeUids = await Array.fromAsync(photosSdk.iterateTimeline(), (photo) => photo.nodeUid);
        for await (const node of photosSdk.iterateNodes(nodeUids)) {
            if (json) {
                console.log(JSON.stringify(node));
            } else {
                console.log(formatReadableJson(node));
            }
        }
    }
}
