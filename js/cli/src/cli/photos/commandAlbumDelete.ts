import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';

export class CommandAlbumDelete implements Command {
    group = 'albums';
    name = 'delete';
    args = ['pathString'];
    options: ParseArgsConfig['options'] = {
        force: {
            type: 'boolean',
            short: 'f',
            default: false,
        },
    };

    async action({ paths, photosSdk, args: [pathString], options: { force } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        await photosSdk.deleteAlbum(node, { force });
        console.log(`Album deleted successfully`);
    }
}
