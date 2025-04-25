import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandSharingRemove implements Command {
    group = 'sharing';
    name = 'remove';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        email: {
            type: 'string',
            short: 'e',
            multiple: true,
            default: [],
        },
        everyone: {
            type: 'boolean',
            short: 'a',
            default: false,
        },
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
        options: { email: emails, everyone, json },
    }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        // FIXME: when supporting public links, everyone should keep it
        const sharingInfo = everyone
            ? await sdk.unshareNode(node)
            : await sdk.unshareNode(node, {
                users: emails,
            });

        if (json) {
            console.log(JSON.stringify(sharingInfo));
        } else {
            console.log(sharingInfo);
        }
    }
}
