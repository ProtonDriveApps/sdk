import { formatReadableJson } from './formatters';
import { Command, ActionArgs } from './interface';

export class CommandAlbumList implements Command {
    group = 'albums';
    name = 'list';

    async action({ photosSdk, options: { json } }: ActionArgs) {
        for await (const album of photosSdk.iterateAlbums()) {
            if (json) {
                console.log(JSON.stringify(album));
            } else {
                console.log(formatReadableJson(album));
            }
        }
    }
}
