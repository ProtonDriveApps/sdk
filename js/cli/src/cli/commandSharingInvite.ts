import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandSharingInvite implements Command {
    group = 'sharing';
    name = 'invite';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        user: {
            type: 'string',
            short: 'u',
            multiple: true,
            default: [],
        },
        role: {
            type: 'string',
            short: 'r',
            default: 'viewer',
        },
        message: {
            type: 'string',
            short: 'm',
            default: '',
        },
        includeNodeName: {
            type: 'boolean',
            short: 'n',
            default: false,
        },
    };

    async action({
        sdk,
        paths,
        args: [ pathString ],
        options: { user: userEmails, role, message, includeNodeName, json },
    }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        const sharingInfo = await sdk.shareNode(node, {
            users: userEmails.map((email: string) => ({ email, role })),
            emailOptions: {
                message: message || undefined,
                includeNodeName,
            },
        });

        if (json) {
            console.log(JSON.stringify(sharingInfo));
        } else {
            console.log(sharingInfo);
        }
    }
}
