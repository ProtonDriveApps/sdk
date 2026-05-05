import { type ActionArgs, type Command } from '../../cli';
import { parseInvitationUid } from './invitations';

export class CommandInvitationReject implements Command {
    group = 'invitation';
    name = 'reject';
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
