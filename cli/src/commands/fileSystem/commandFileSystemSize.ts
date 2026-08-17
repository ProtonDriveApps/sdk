import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandFileSystemSize implements Command {
    group = 'filesystem';
    name = 'size';
    help = 'Calculates the size of a folder, including all active and trashed descendants.';
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const node = await paths.getNode(pathString);
        const folderSize = await sdk.getFolderSize(node);
        printObject(folderSize, json);
    }
}
