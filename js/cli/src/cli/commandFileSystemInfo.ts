import { inspect } from "util";
import { Command, ActionArgs } from './interface';

export class CommandFileSystemInfo implements Command {
    group = 'filesystem';
    name = 'info';
    args = ['path'];

    async action({ paths, args: [ pathString ], options: { json }  }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();
        if (json) {
            console.log(JSON.stringify(node));
        } else {
            // Use inspect to disable the depth limit.
            console.log(inspect(node, {showHidden: false, depth: null, colors: true}));
        }
    }
}
