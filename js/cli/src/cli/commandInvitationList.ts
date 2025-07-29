import { Command, ActionArgs } from './interface';

export class CommandInvitationList implements Command {
    group = 'invitation';
    name = 'list';

    async action({ sdk, options: { json } }: ActionArgs) {
        for await (const invitation of sdk.iterateInvitations()) {
            if (json) {
                console.log(JSON.stringify(invitation));
            } else {
                console.log(invitation);
            }
        }
    }
}
