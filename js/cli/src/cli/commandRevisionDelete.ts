import { Command, ActionArgs } from './interface';

export class CommandRevisionDelete implements Command {
    group = 'revision';
    name = 'delete';
    args = ['revisionUid'];

    async action({ sdk, args: [revisionUid], options: { json } }: ActionArgs) {
        await sdk.deleteRevision(revisionUid);
        if (!json) {
            console.log(`Deleted revision: ${revisionUid}`);
        }
    }
}
