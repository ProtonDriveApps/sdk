import { Command, ActionArgs } from './interface';

export class CommandFileSystemTrash implements Command {
    group = 'filesystem';
    name = 'trash';
    // TODO: support trahs of multiple files
    args = ['path'];

    async action({ sdk, paths, args: [ pathString ] }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        for await (const result of sdk.trashNodes([node])) {
            if (!result.ok) {
                throw new Error(result.error);
            }
        }
    }
}
