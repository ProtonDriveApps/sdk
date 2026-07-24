import { ParseArgsConfig } from 'util';

import { type ActionArgs, type Command } from '../../cli';

export class CommandAlbumDelete implements Command {
    group = 'album';
    name = 'delete';
    args = ['albumPath'];
    options: ParseArgsConfig['options'] = {
        force: {
            type: 'boolean',
            short: 'f',
            default: false,
        },
        save: {
            type: 'boolean',
            short: 's',
            default: false,
        },
    };

    async action({ paths, photosSdk, args: [pathString], options: { force, save, json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        await photosSdk.deleteAlbum(node, { force, saveToTimeline: save });

        if (!json) {
            console.log('✅ Album deleted');
        }
    }
}
