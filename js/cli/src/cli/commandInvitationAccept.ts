import { Command, ActionArgs } from './interface';

export class CommandInvitationAccept implements Command {
    group = 'invitation';
    name = 'accept';
    args = ['invitationUid'];

    async action({ sdk, args: [invitationUid] }: ActionArgs) {
        await sdk.acceptInvitation(invitationUid);
    }
}
