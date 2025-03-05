import { Command, ActionArgs } from './interface';

export class CommandSharing implements Command {
    name = 'sharing';
    args = ['path'];

    async action({ sdk, paths, args: [ pathString ] }: ActionArgs) {
        const path = paths.getPath(pathString);

        const node = await path.getNode();
        const sharingInfo = await sdk.getSharingInfo(node);
        console.log(sharingInfo);
    }
}
