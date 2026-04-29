import { type ActionArgs, type Command } from '../../cli';

export class CommandFileSystemEmptyTrash implements Command {
    group = 'filesystem';
    name = 'empty-trash';

    async action({ sdk, options: { json } }: ActionArgs) {
        await sdk.emptyTrash();
        if (!json) {
            console.log('✅ Trash emptied');
        }
    }
}
