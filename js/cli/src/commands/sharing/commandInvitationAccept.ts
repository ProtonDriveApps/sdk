import { type ActionArgs, type Command } from '../../cli';
import { parseInvitationUid } from './invitations';

export class CommandInvitationAccept implements Command {
    group = 'invitation';
    name = 'accept';
    args = ['invitationUid'];

    async action({ sdk, photosSdk, args: [invitationUid], options: { json } }: ActionArgs) {
        const { isForPhotos, uid } = parseInvitationUid(invitationUid);
        if (isForPhotos) {
            await photosSdk.acceptInvitation(uid);
        } else {
            await sdk.acceptInvitation(uid);
        }

        if (!json) {
            console.log(`✅ Invitation accepted`);
        }
    }
}
