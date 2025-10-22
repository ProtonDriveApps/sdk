import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { PathType } from '../paths';

export class CommandFileSystemCreateFolder implements Command {
    group = 'filesystem';
    name = 'create-folder';
    args = ['path', 'name'];

    async action({ sdk, paths, args: [pathString, name], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const parent = await nodePath.getNode();

        if (nodePath.type === PathType.Photos) {
            throw new Error('Creating folders in photos is not supported');
        }

        const folder = await sdk.createFolder(parent, name, new Date());

        printObject(folder, json);
    }
}
