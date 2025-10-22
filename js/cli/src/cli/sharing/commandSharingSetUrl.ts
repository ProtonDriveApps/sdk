import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { printObject } from '../formatters';

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

        if (role !== 'viewer' && role !== 'editor') {
            throw new Error(`Invalid role: ${role}`);
        }

        if (expiration && isNaN(new Date(expiration).getTime())) {
            throw new Error(`Invalid expiration date: ${expiration}`);
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
