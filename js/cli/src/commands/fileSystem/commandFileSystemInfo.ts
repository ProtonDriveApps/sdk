import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandFileSystemInfo implements Command {
    group = 'filesystem';
    name = 'info';
    help = 'Shows full node metadata including latest revision details.';
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const node = await paths.getNode(pathString);
        printObject(node, json);
    }
}
