import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';

export class CommandInvitationReject implements Command {
    group = 'invitation';
    name = 'reject';
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
            await photosSdk.rejectInvitation(invitationUid);
        } else {
            await sdk.rejectInvitation(invitationUid);
        }

        if (!json) {
            console.log(`Invitation rejected: ${invitationUid}`);
        }
    }
}
