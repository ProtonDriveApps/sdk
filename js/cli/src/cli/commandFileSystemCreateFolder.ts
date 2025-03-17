import { ParseArgsConfig, inspect } from "util";
import { Command, ActionArgs } from './interface';

export class CommandFileSystemCreateFolder implements Command {
    group = 'filesystem';
    name = 'create-folder';
    args = ['path', 'name'];
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({ sdk, paths, args: [ pathString, name ], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const parent = await path.getNode();
        const folder = await sdk.createFolder(parent, name, new Date());

        if (json) {
            console.log(JSON.stringify(folder));
        } else {
            // Use inspect to disable the depth limit.
            console.log(inspect(folder, {showHidden: false, depth: null, colors: true}));
        }
    }
}
