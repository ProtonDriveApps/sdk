import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandFileSystemTrash implements Command {
    group = 'filesystem';
    name = 'trash';
    // FIXME: support trahs of multiple files
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        await printIterable(nodePath.sdk.trashNodes([node]), json, (result) =>
            console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`),
        );
    }
}
