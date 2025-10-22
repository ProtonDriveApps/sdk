import { Command, ActionArgs } from '../interface';

export class CommandInvitationReject implements Command {
    group = 'invitation';
    name = 'reject';
    args = ['invitationUid'];

    async action({ sdk, args: [invitationUid], options: { json } }: ActionArgs) {
        await sdk.rejectInvitation(invitationUid);
        if (!json) {
            console.log(`Invitation rejected: ${invitationUid}`);
        }
    }
}
