import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandFileSystemGetAvailableName implements Command {
    group = 'filesystem';
    name = 'getAvailableName';
    args = ['path', 'name'];

    async action({ sdk, paths, args: [pathString, name], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();
        const availableName = await sdk.getAvailableName(node, name);
        printObject({
            availableName,
        }, json);
    }
}
