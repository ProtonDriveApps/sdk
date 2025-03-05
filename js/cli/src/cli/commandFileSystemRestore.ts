import { Command, ActionArgs } from './interface';

export class CommandFileSystemRestore implements Command {
    group = 'filesystem';
    name = 'restore';
    // TODO: support restore of multiple files
    args = ['path'];

    async action({ sdk, paths, args: [ pathString ] }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        for await (const result of sdk.restoreNodes([node])) {
            if (!result.ok) {
                throw new Error(result.error);
            }
        }
    }
}
