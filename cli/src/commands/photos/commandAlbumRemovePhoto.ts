import { type ActionArgs, type Command, findName, printIterable } from '../../cli';

export class CommandAlbumRemovePhoto implements Command {
    group = 'album';
    name = 'remove-photo';
    args = ['albumPath', 'photoPath...'];

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

        await printIterable(photosSdk.removePhotosFromAlbum(albumNode, photoNodes), json, (result) => {
            const nodeName = findName(photoNodes, result.uid);
            console.log(result.ok ? `✅ ${nodeName}` : `❌ ${nodeName}: ${result.error.message}`);
        });
    }
}
