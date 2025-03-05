import { Command, ActionArgs } from './interface';

export class CommandInvitationList implements Command {
    group  = 'invitation';
    name = 'list';

    async action({ sdk }: ActionArgs) {
        for await (const invitation of sdk.iterateInvitations()) {
            console.log(invitation);
        }
    }
}
