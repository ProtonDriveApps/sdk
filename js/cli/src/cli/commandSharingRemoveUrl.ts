import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandSharingRemoveUrl implements Command {
    group = 'sharing';
    name = 'remove-url';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({
        sdk,
        paths,
        args: [ pathString ],
        options: { json },
    }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        const sharingInfo = await sdk.unshareNode(node, {
            publicLink: 'remove',
        });

        if (json) {
            console.log(JSON.stringify(sharingInfo));
        } else {
            console.log(sharingInfo);
        }
    }
}
