import { type ActionArgs, type Command } from '../../cli';
import { parseInvitationUid } from './invitations';

export class CommandInvitationReject implements Command {
    group = 'invitation';
    name = 'reject';
    help = 'Rejects a pending invitation. Get the UID from the invitation list command.';
    args = ['invitationUid'];

    async action({ sdk, photosSdk, args: [invitationUid], options: { json } }: ActionArgs) {
        const { isForPhotos, uid } = parseInvitationUid(invitationUid);
        if (isForPhotos) {
            await photosSdk.rejectInvitation(uid);
        } else {
            await sdk.rejectInvitation(uid);
        }

        if (!json) {
            console.log(`✅ Invitation rejected`);
        }
    }
}
