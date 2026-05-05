import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandSharingStatus implements Command {
    group = 'sharing';
    name = 'status';
    args = ['path'];

    async action({ paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const sharingInfo = await nodePath.sdk.getSharingInfo(node);

        printObject(sharingInfo, json);
    }
}
