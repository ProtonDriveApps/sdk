import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandAlbumRemovePhoto implements Command {
    group = 'albums';
    name = 'remove-photo';
    args = ['albumPath', 'photoPath'];

    async action({ paths, photosSdk, args: [albumPathString, ...photoPathStrings], options: { json } }: ActionArgs) {
        if (photoPathStrings.length === 0) {
            throw new Error('At least one photo identifier must be provided');
        }

        const albumNodePath = paths.getPath(albumPathString);
        const albumNode = await albumNodePath.getNode();

        const photoNodes = await Promise.all(
            photoPathStrings.map(async (photoPathString) => {
                const photoPath = paths.getPath(photoPathString);
                return photoPath.getNode();
            }),
        );

        await printIterable(photosSdk.removePhotosFromAlbum(albumNode, photoNodes), json, (result) =>
            console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`),
        );
    }
}
