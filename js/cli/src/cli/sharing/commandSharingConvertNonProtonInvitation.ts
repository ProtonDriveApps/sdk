import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { printObject } from '../formatters';

export class CommandSharingConvertNonProtonInvitation implements Command {
    group = 'sharing';
    name = 'convert-non-proton-invitation';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        'invitation-uid': {
            type: 'string',
            short: 'i',
        },
    };

    async action({ paths, args: [pathString], options: { 'invitation-uid': invitationUid, json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const invitation = await nodePath.sdk.convertNonProtonInvitation(node, invitationUid as string);

        printObject(invitation, json);
    }
}
