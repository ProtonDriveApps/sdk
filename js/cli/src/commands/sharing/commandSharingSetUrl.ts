import { ParseArgsConfig } from 'util';

import { MemberRole, ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, printObject } from '../../cli';

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
