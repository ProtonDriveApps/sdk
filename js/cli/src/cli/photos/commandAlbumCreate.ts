import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandAlbumCreate implements Command {
    group = 'albums';
    name = 'create';
    args = ['name'];

    async action({ photosSdk, args: [name], options: { json } }: ActionArgs) {
        const album = await photosSdk.createAlbum(name);
        printObject(album, json);
    }
}
