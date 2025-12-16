import { Command, ActionArgs } from '../interface';

export class CommandFileSystemEmptyTrash implements Command {
    group = 'filesystem';
    name = 'empty-trash';

    async action({ sdk }: ActionArgs) {
        await sdk.emptyTrash();
        console.log('Trash emptied');
    }
}
