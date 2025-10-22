import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandInvitationList implements Command {
    group = 'invitation';
    name = 'list';

    async action({ sdk, options: { json } }: ActionArgs) {
        await printIterable(sdk.iterateInvitations(), json);
    }
}
