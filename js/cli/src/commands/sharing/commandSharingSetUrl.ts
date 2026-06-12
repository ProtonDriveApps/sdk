import { MemberRole, ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, Options, printObject } from '../../cli';

export class CommandSharingSetUrl implements Command {
    group = 'sharing';
    name = 'set-url';
    help = 'Creates or updates a public link for the node.';
    args = ['path'];
    options: Options = {
        role: {
            type: 'string',
            default: 'viewer',
            allowedValues: [MemberRole.Viewer, MemberRole.Editor],
            help: 'Role of the users to invite.',
        },
        password: {
            type: 'string',
            default: '',
            help: 'Custom password for the shared link.',
        },
        expiration: {
            type: 'string',
            default: '',
            help: 'Expiration date of the shared link in ISO format (e.g. 2025-06-06).',
        },
    };

    async action({ paths, args: [pathString], options: { json, role, password, expiration } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        if (role !== MemberRole.Viewer && role !== MemberRole.Editor) {
            throw new ValidationError(`Invalid role: ${role}, must be one of: viewer, editor`);
        }

        if (expiration && isNaN(new Date(expiration).getTime())) {
            throw new ValidationError(`Invalid expiration date: ${expiration}`);
        }

        const sharingInfo = await nodePath.sdk.shareNode(node, {
            publicLink: {
                role,
                customPassword: password || undefined,
                expiration: expiration ? new Date(expiration) : undefined,
            },
        });

        printObject(sharingInfo, json);
    }
}
