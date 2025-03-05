import { Command, ActionArgs } from './interface';

export class CommandFileSystemRename implements Command {
    group = 'filesystem';
    name = 'rename';
    args = ['path', 'newName'];

    async action({ sdk, paths, args: [ pathString, newName ] }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        await sdk.renameNode(node, newName);
    }
}
