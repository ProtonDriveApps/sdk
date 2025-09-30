import { Command, ActionArgs } from './interface';
import { printObject } from './formatters';

export class CommandSharingRemoveUrl implements Command {
    group = 'sharing';
    name = 'remove-url';
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        const sharingInfo = await sdk.unshareNode(node, {
            publicLink: 'remove',
        });

        printObject(sharingInfo, json);
    }
}
