import path from 'node:path';
import { ParseArgsConfig } from "util";

import { Command, ActionArgs } from './interface';
import { getName } from './node';

export class CommandFileSystemDownload implements Command {
    group = 'filesystem';
    name = 'download';
    // FIXME: support download of multiple files
    args = ['path', 'localPath'];
    options: ParseArgsConfig['options'] = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
        },
    };

    async action({ sdk, paths, args: [ pathString, localParentPath ], options: { name } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        const downloader = await sdk.getFileDownloader(node);

        const claimedSize = downloader.getClaimedSizeInBytes();
        const localPath = path.join(localParentPath, name || getName(node));
        console.log(`Downloading ${getName(node)} (${claimedSize || 'N/A'} bytes) to ${localPath}`);

        const file = Bun.file(localPath);
        const writer = file.writer();
        const writableStream: WritableStream = {
            getWriter: () => writer,
            close: () => writer.end(),
            abort: () => writer.end(),
            locked: false,
        }

        const controller = downloader.writeToStream(writableStream, (writtenBytes) => {
            console.log(`Downloaded ${writtenBytes} bytes`);
        });

        await controller.completion();
    }
}
