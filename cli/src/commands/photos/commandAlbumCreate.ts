import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandAlbumCreate implements Command {
    group = 'album';
    name = 'create';
    args = ['name'];

    async action({ photosSdk, args: [name], options: { json } }: ActionArgs) {
        const album = await photosSdk.createAlbum(name);

        printObject(album, json);
    }
}
