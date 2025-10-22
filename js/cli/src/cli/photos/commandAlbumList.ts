import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandAlbumList implements Command {
    group = 'albums';
    name = 'list';

    async action({ photosSdk, options: { json } }: ActionArgs) {
        await printIterable(photosSdk.iterateAlbums(), json);
    }
}
