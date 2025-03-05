import { Command, ActionArgs } from './interface';

export class CommandInvitations implements Command {
    name = 'invitations';

    async action({ sdk }: ActionArgs) {
        for await (const invitation of sdk.iterateInvitations()) {
            console.log(invitation);
        }
    }
}
