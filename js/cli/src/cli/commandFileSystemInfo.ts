import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandFileSystemInfo implements Command {
    group = 'filesystem';
    name = 'info';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        humanReadable: {
            type: 'boolean',
            short: 'h',
            default: false,
        },
    };

    async action({ paths, args: [ pathString ], options: { humanReadable }  }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();
        // TODO: use humanReadable to format the output
        console.log(node);
    }
}
