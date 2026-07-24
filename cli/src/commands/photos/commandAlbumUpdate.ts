import { ParseArgsConfig } from 'util';

import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandAlbumUpdate implements Command {
    group = 'album';
    name = 'update';
    args = ['albumPath'];
    options: ParseArgsConfig['options'] = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
        },
        'cover-photo-uid': {
            type: 'string',
            short: 'c',
            default: '',
        },
    };

    async action({
        paths,
        photosSdk,
        args: [pathString],
        options: { json, name, 'cover-photo-uid': coverPhotoUid },
    }: ActionArgs) {
        if (!name && !coverPhotoUid) {
            throw new Error('At least one update option must be provided: --name, --cover-photo-uid');
        }

        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const updates: {
            name?: string;
            coverPhotoNodeUid?: string;
        } = {};

        if (name) {
            updates.name = name;
        }
        if (coverPhotoUid) {
            updates.coverPhotoNodeUid = coverPhotoUid;
        }

        const album = await photosSdk.updateAlbum(node, updates);
        printObject(album, json);
    }
}
