import { PhotoNode } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, formatDate, getName, printIterable, sanitizeTerminalText } from '../../cli';

export class CommandAlbumList implements Command {
    group = 'album';
    name = 'list';

    async action({ photosSdk, options: { json } }: ActionArgs) {
        await printIterable(photosSdk.iterateAlbums(), json, (node) => this.printAlbumHuman(node));
    }

    private printAlbumHuman(node: PhotoNode): void {
        const sharedFlag = node.isShared ? '🔗' : '  '; // Two spaces to align with the shared icon.
        const created = formatDate(node.creationTime, true);
        const name = getName(node);
        console.log(sanitizeTerminalText(`${sharedFlag} ${created} ${name} (${node.album?.photoCount ?? 0} photos)`));
    }
}
