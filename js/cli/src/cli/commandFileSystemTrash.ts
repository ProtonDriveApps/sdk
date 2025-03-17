import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandFileSystemTrash implements Command {
    group = 'filesystem';
    name = 'trash';
    // TODO: support trahs of multiple files
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({ sdk, paths, args: [ pathString ], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        for await (const result of sdk.trashNodes([node])) {
            if (json) {
                console.log(JSON.stringify(result));
            } else {
                console.log(result.ok ? `Trashed ${result.uid}` : `Failed to trash ${result.uid}: ${result.error}`);
            }
        }
    }
}
