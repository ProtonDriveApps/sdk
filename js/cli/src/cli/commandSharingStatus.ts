import { Command, ActionArgs } from './interface';

export class CommandSharingStatus implements Command {
    group = 'sharing';
    name = 'status';
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);

        const node = await path.getNode();
        const sharingInfo = await sdk.getSharingInfo(node);

        if (json) {
            console.log(JSON.stringify(sharingInfo));
        } else {
            console.log(sharingInfo);
        }
    }
}
