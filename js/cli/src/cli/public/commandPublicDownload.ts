import path from 'node:path';
import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { getName } from '../node';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicDownload implements Command {
    group = 'public';
    name = 'download';
    args = ['path', 'localParentPath'];
    options: ParseArgsConfig['options'] = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
        },
        ...PUBLIC_OPTIONS,
    };

    async action({
        paths,
        args: [pathString, localParentPath],
        options: { name, json, url, 'custom-password': customPassword },
    }: ActionArgs) {
        const client = await paths.authPublicLinkSession(url, customPassword);
        const nodePath = paths.getPublicLinkPath(pathString);
        const node = await nodePath.getNode();
        const downloader = await client.getFileDownloader(node);

        const claimedSize = downloader.getClaimedSizeInBytes();
        const localPath = path.join(localParentPath, name || getName(node));

        if (!json) {
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
