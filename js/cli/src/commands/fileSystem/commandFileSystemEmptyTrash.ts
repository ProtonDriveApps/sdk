import { type ActionArgs, type Command } from '../../cli';

export class CommandFileSystemEmptyTrash implements Command {
    group = 'filesystem';
    name = 'empty-trash';
    help = 'Permanently deletes all items in /trash. Does not affect /photos-trash. The operation is asynchronous.';

    async action({ sdk, options: { json } }: ActionArgs) {
        await sdk.emptyTrash();
        if (!json) {
            console.log('✅ Trash emptied');
        }
    }
}
