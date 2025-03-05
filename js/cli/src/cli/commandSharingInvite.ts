import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandSharingInvite implements Command {
    group = 'sharing';
    name = 'invite';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        // TODO: merge internal and external users into one option
        user: {
            type: 'string',
            short: 'u',
            multiple: true,
            default: [],
        },
        email: {
            type: 'string',
            short: 'e',
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
        options: { user: userEmails, email: externalEmails, role, message, includeNodeName },
    }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        const sharingInfo = await sdk.shareNode(node, {
            protonUsers: userEmails.map((email: string) => ({ email, role })),
            nonProtonUsers: externalEmails.map((email: string) => ({ email, role })),
            emailOptions: {
                message: message || undefined,
                includeNodeName,
            },
        });
        console.log(sharingInfo);
    }
}
