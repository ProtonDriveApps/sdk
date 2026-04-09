import { printObject, type Command, type ActionArgs } from '../../cli';

export class CommandFileSystemInfo implements Command {
    group = 'filesystem';
    name = 'info';
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const node = await paths.getNode(pathString);
        printObject(node, json);
    }
}
