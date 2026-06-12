import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandFileSystemRename implements Command {
    group = 'filesystem';
    name = 'rename';
    help = 'Renames a node in place. Does not move it to a different folder.';
    args = ['path', 'newName'];

    async action({ paths, args: [pathString, newName], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        const renamedNode = await path.sdk.renameNode(node, newName);

        printObject(renamedNode, json);
    }
}
