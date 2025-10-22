import { Command, ActionArgs } from '../interface';

export class CommandInvitationAccept implements Command {
    group = 'invitation';
    name = 'accept';
    args = ['invitationUid'];

    async action({ sdk, args: [invitationUid], options: { json } }: ActionArgs) {
        await sdk.acceptInvitation(invitationUid);
        if (!json) {
            console.log(`Invitation accepted: ${invitationUid}`);
        }
    }
}
