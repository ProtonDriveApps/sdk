import { ParseArgsConfig } from 'util';
import { Command, ActionArgs } from './interface';

export class CommandSharingSetUrl implements Command {
    group = 'sharing';
    name = 'set-url';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        role: {
            type: 'string',
            default: 'viewer',
        },
        password: {
            type: 'string',
            default: '',
        },
        expiration: {
            type: 'string',
            default: '',
        },
    };

    async action({ sdk, paths, args: [pathString], options: { json, role, password, expiration } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        if (role !== 'viewer' && role !== 'editor') {
            throw new Error(`Invalid role: ${role}`);
        }

        if (expiration && isNaN(new Date(expiration).getTime())) {
            throw new Error(`Invalid expiration date: ${expiration}`);
        }

        const sharingInfo = await sdk.shareNode(node, {
            publicLink: {
                role,
                customPassword: password || undefined,
                expiration: expiration ? new Date(expiration) : undefined,
            },
        });

        if (json) {
            console.log(JSON.stringify(sharingInfo));
        } else {
            console.log(sharingInfo);
        }
    }
}
