import { Command, ActionArgs } from './interface';

export class CommandFileSystemTrash implements Command {
    group = 'filesystem';
    name = 'trash';
    // FIXME: support trahs of multiple files
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        for await (const result of sdk.trashNodes([node])) {
            if (json) {
                console.log(JSON.stringify(result));
            } else {
                console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`);
            }
        }
    }
}
