import { Command, ActionArgs } from './interface';

export class CommandRevisionDelete implements Command {
    group = 'revision';
    name = 'delete';
    args = ['revisionUid'];

    async action({ sdk, args: [revisionUid] }: ActionArgs) {
        await sdk.deleteRevision(revisionUid);
    }
}
