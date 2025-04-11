import path from 'node:path';
import { ParseArgsConfig } from "util";

import { Command, ActionArgs } from './interface';

export class CommandFileSystemUpload implements Command {
    group = 'filesystem';
    name = 'upload';
    // TODO: support upload of multiple files
    args = ['localPath', 'parentPath'];
    options: ParseArgsConfig['options'] = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
        },
    };

    async action({ sdk, paths, args: [ localPath, parentPath ], options: { name } }: ActionArgs) {
        name = name || path.basename(localPath);

        const file = Bun.file(localPath);
        const metadata = {
            mimeType: file.type,
            expectedSize: file.size,
        }

        const parentNodePath = paths.getPath(parentPath);
        const parentNode = await parentNodePath.getNode();

        const uploader = await sdk.getFileUploader(parentNode, name, metadata);
        console.log(`Uploading ${name} (${metadata.expectedSize || 'N/A'} bytes)`);

        const thumbnails = []; // TODO
        const controller = uploader.writeStream(file.stream(), thumbnails, (writtenBytes) => {
            console.log(`Uploaded ${writtenBytes} bytes`);
        });

        await controller.completion();
    }
}
