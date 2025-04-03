import { ParseArgsConfig, inspect } from "util";
import { Command, ActionArgs } from './interface';

export class CommandFileSystemRename implements Command {
    group = 'filesystem';
    name = 'rename';
    args = ['path', 'newName'];
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({ sdk, paths, args: [ pathString, newName ], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        const renamedNode = await sdk.renameNode(node, newName);

        if (json) {
            console.log(JSON.stringify(renamedNode));
        } else {
            // Use inspect to disable the depth limit.
            console.log(inspect(node, {showHidden: false, depth: null, colors: true}));
        }
    }
}
