import { ParseArgsConfig } from 'util';

import { MemberRole, ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, printObject } from '../../cli';

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
        'include-node-name': {
            type: 'boolean',
            short: 'n',
            default: false,
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
