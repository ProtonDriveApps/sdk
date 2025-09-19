import { formatReadableJson } from './formatters';
import { Command, ActionArgs } from './interface';

export class CommandFileSystemRename implements Command {
    group = 'filesystem';
    name = 'rename';
    args = ['path', 'newName'];

    async action({ sdk, paths, args: [pathString, newName], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        const renamedNode = await sdk.renameNode(node, newName);

        if (json) {
            console.log(JSON.stringify(renamedNode));
        } else {
            console.log(formatReadableJson(renamedNode));
        }
    }
}
