import path from 'node:path';
import { Command, ActionArgs } from './interface';

export class CommandFileSystemDownloadThumbnails implements Command {
    group = 'filesystem';
    name = 'download-thumbnails';
    // FIXME: support download of multiple thumbnails
    args = ['path', 'parentLocalPath'];

    async action({ sdk, paths, args: [ pathString, parentLocalPath ], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        for await (const result of sdk.iterateThumbnails([node])) {
            // Thumbnail can be jpeg or webp. All new code should produce webp.
            const thumbnailFileName = `thumbnail-${result.nodeUid}.webp`;
            const thumbnailFilePath = path.join(parentLocalPath, thumbnailFileName);

            if (json) {
                console.log(JSON.stringify({
                    ...result,
                    thumbnail: undefined, // Avoid dumping binary data to JSON.
                    thumbnailFileName,
                }));
            } else {
                console.log(
                    result.ok
                        ? `Downloaded thumbnail for ${result.nodeUid}`
                        : `Failed to download thumbnail for ${result.nodeUid}: ${result.error}`
                );
            }

            if (result.ok) {
                await Bun.write(thumbnailFilePath, result.thumbnail);
            }
        }
    }
}
