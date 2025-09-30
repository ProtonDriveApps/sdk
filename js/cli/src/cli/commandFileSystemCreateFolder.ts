import { printObject } from './formatters';
import { Command, ActionArgs } from './interface';

export class CommandFileSystemCreateFolder implements Command {
    group = 'filesystem';
    name = 'create-folder';
    args = ['path', 'name'];

    async action({ sdk, paths, args: [pathString, name], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const parent = await path.getNode();
        const folder = await sdk.createFolder(parent, name, new Date());

        printObject(folder, json);
    }
}
