import path from 'node:path';
import { ParseArgsConfig } from 'util';

import { Thumbnail } from '../../../sdk/src';
import { Command, ActionArgs } from './interface';

export class CommandPhotoUpload implements Command {
    group = 'photo';
    name = 'upload';
    // FIXME: support upload of multiple files
    args = ['localPath'];
    options: ParseArgsConfig['options'] = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
        },
    };

    async action({ photosSdk, args: [localPath], options: { json, name } }: ActionArgs) {
        name = name || path.basename(localPath);

        const file = Bun.file(localPath);
        const metadata = {
            mediaType: file.type,
            expectedSize: file.size,
        };

        const uploader = await photosSdk.getFileUploader(name, metadata);

        if (!json) {
            console.log(`Uploading ${name} (${metadata.expectedSize || 'N/A'} bytes)`);
        }

        const thumbnails: Thumbnail[] = []; // TODO
        const controller = await uploader.uploadFromStream(file.stream(), thumbnails, (writtenBytes) => {
            if (!json) {
                console.log(`Uploaded ${writtenBytes} bytes`);
            }
        });

        await controller.completion();
    }
}
