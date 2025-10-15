import path from 'node:path';
import { ParseArgsConfig } from 'util';

import { Thumbnail } from '../../../sdk/src';
import { Command, ActionArgs } from './interface';

export class CommandFileSystemUpload implements Command {
    group = 'filesystem';
    name = 'upload';
    // FIXME: support upload of multiple files
    args = ['localPath', 'parentPath'];
    options: ParseArgsConfig['options'] = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
        },
        'new-revision': {
            type: 'boolean',
            short: 'r',
            default: false,
        },
    };

    async action({ sdk, paths, args: [localPath, parentPath], options: { json, name, newRevision } }: ActionArgs) {
        name = name || path.basename(localPath);

        const file = Bun.file(localPath);
        const metadata = {
            mediaType: file.type,
            expectedSize: file.size,
        };

        let uploader;
        if (newRevision) {
            const parentNodePath = paths.getPath(parentPath);
            const node = await parentNodePath.getChild(name);
            uploader = await sdk.getFileRevisionUploader(node, metadata);
        } else {
            const parentNodePath = paths.getPath(parentPath);
            const parentNode = await parentNodePath.getNode();
            uploader = await sdk.getFileUploader(parentNode, name, metadata);
        }

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
