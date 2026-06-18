import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandSharingRemoveUrl implements Command {
    group = 'sharing';
    name = 'remove-url';
    help = 'Removes the public link. Direct member access is not affected.';
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const sharingInfo = await nodePath.sdk.unshareNode(node, {
            publicLink: 'remove',
        });

        printObject(sharingInfo, json);
    }
}
