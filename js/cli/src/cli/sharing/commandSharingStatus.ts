import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';

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
