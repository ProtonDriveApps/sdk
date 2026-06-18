import { MemberRole, ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, Options, printObject } from '../../cli';

export class CommandSharingInvite implements Command {
    group = 'sharing';
    name = 'invite';
    help = 'Invites users by email. Updates sharing settings if the node is already shared with given users.';
    args = ['path'];
    options: Options = {
        user: {
            type: 'string',
            short: 'u',
            multiple: true,
            default: [],
            help: 'Email addresses of the users to invite.',
        },
        role: {
            type: 'string',
            short: 'r',
            default: 'viewer',
            allowedValues: Object.values(MemberRole),
            help: 'Role of the users to invite.',
        },
        message: {
            type: 'string',
            short: 'm',
            default: '',
            help: 'Message to be included in the invitation email.',
        },
        'include-node-name': {
            type: 'boolean',
            short: 'n',
            default: false,
            help: 'Whether to include the node name in the invitation email.',
        },
    };

    async action({
        paths,
        args: [pathString],
        options: { user: userEmails, role, message, 'include-node-name': includeNodeName, json },
    }: ActionArgs) {
        if (role !== MemberRole.Viewer && role !== MemberRole.Editor && role !== MemberRole.Admin) {
            throw new ValidationError(`Invalid role: ${role}, must be one of: viewer, editor, admin`);
        }

        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const sharingInfo = await nodePath.sdk.shareNode(node, {
            users: userEmails.map((email: string) => ({ email, role })),
            emailOptions: {
                message: message || undefined,
                includeNodeName,
            },
        });

        printObject(sharingInfo, json);
    }
}
