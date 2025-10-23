import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';

export class CommandInvitationAccept implements Command {
    group = 'invitation';
    name = 'accept';
    args = ['invitationUid'];
    options: ParseArgsConfig['options'] = {
        photos: {
            type: 'boolean',
            short: 'p',
            default: false,
        },
    };

    async action({ sdk, photosSdk, args: [invitationUid], options: { photos, json } }: ActionArgs) {
        if (photos) {
            await photosSdk.acceptInvitation(invitationUid);
        } else {
            await sdk.acceptInvitation(invitationUid);
        }

        if (!json) {
            console.log(`Invitation accepted: ${invitationUid}`);
        }
    }
}
