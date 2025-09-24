import path from 'node:path';
import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from './interface';
import { getName } from './node';

export class CommandPhotoDownload implements Command {
    group = 'photo';
    name = 'download';
    // FIXME: support download of multiple files
    args = ['path', 'localParentPath'];
    options: ParseArgsConfig['options'] = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
        },
    };

    async action({ photosSdk, paths, args: [pathString, localParentPath], options: { json, name } }: ActionArgs) {
        const nodePath = paths.getPhotoPath(pathString);
        const node = await nodePath.getNode();
        const downloader = await photosSdk.getFileDownloader(node);

        const claimedSize = downloader.getClaimedSizeInBytes();
        const localPath = path.join(localParentPath, name || getName(node));

        if (json) {
            console.log(
                JSON.stringify({
                    localPath: localPath,
                    name: getName(node),
                    claimedSize,
                }),
            );
        } else {
            console.log(`Downloading ${getName(node)} (${claimedSize || 'N/A'} bytes) to ${localPath}`);
        }

        const file = Bun.file(localPath);
        const writer = file.writer();
        const writableStream: WritableStream = {
            getWriter: () => writer,
            close: () => writer.end(),
            abort: () => writer.end(),
            locked: false,
        };

        const controller = downloader.downloadToStream(writableStream, (writtenBytes) => {
            if (!json) {
                console.log(`Downloaded ${writtenBytes} bytes`);
            }
        });

        await controller.completion();
    }
}
