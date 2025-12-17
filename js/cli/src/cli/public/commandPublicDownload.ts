import path from 'node:path';
import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { download } from '../downloader';
import { getName } from '../node';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicDownload implements Command {
    group = 'public';
    name = 'download';
    isPublicAction = true;
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

        await download({
            downloader,
            downloadingName: getName(node),
            localPath: path.join(localParentPath, name || getName(node)),
            json,
        });
    }
}
