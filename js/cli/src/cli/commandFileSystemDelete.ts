import { printIterable } from './formatters';
import { Command, ActionArgs } from './interface';

export class CommandFileSystemDelete implements Command {
    group = 'filesystem';
    name = 'delete';
    // FIXME: support delete of multiple files
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        await printIterable(sdk.deleteNodes([node]), json, (result) =>
            console.log(result.ok ? `Deleted ${result.uid}` : `Failed to delete ${result.uid}: ${result.error}`),
        );
    }
}
