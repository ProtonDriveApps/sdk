import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandSharingStatus implements Command {
    group = 'sharing';
    name = 'status';
    help = 'Shows members, pending invitations, and public link settings for a node.';
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const sharingInfo = await nodePath.sdk.getSharingInfo(node);

        printObject(sharingInfo, json);
    }
}
