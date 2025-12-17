import path from 'node:path';
import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { download } from '../downloader';
import { getName } from '../node';

export class CommandFileSystemDownload implements Command {
    group = 'filesystem';
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

    async action({ paths, args: [pathString, localParentPath], options: { name, json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        const downloader = await nodePath.sdk.getFileDownloader(node);

        await download({
            downloader,
            downloadingName: getName(node),
            localPath: path.join(localParentPath, name || getName(node)),
            json,
        });
    }
}
