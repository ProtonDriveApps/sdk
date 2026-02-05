import { Command, ActionArgs } from '../interface';

export class CommandPhotoEmptyTrash implements Command {
    group = 'photo';
    name = 'trash';

    async action({ photosSdk }: ActionArgs) {
        await photosSdk.emptyTrash();
        console.log('Photo volume trash emptied');
    }
}
