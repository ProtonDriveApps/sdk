import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandFileSystemRestore implements Command {
    group = 'filesystem';
    name = 'restore';
    // FIXME: support restore of multiple files
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        await printIterable(nodePath.sdk.restoreNodes([node]), json, (result) =>
            console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`),
        );
    }
}
