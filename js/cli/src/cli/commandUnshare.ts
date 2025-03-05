import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandUnhare implements Command {
    name = 'unshare';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        email: {
            type: 'string',
            short: 'e',
            multiple: true,
            default: [],
        },
        all: {
            type: 'boolean',
            short: 'a',
            default: false,
        },
    };

    async action({
        sdk,
        paths,
        args: [ pathString ],
        options: { email: emails, all },
    }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        const sharingInfo = all
            ? await sdk.unshareNode(node)
            : await sdk.unshareNode(node, {
                users: emails,
            });
        console.log(sharingInfo);
    }
}
