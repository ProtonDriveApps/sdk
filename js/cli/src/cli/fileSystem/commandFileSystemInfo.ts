import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandFileSystemInfo implements Command {
    group = 'filesystem';
    name = 'info';
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();
        printObject(node, json);
    }
}
