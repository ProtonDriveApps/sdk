import { Command, ActionArgs } from './interface';

export class CommandRevisionRestore implements Command {
    group = 'revision';
    name = 'restore';
    args = ['revisionUid'];

    async action({ sdk, args: [ revisionUid ] }: ActionArgs) {
        await sdk.restoreRevision(revisionUid);
    }
}
