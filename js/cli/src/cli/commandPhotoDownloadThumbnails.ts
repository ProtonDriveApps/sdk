import path from 'node:path';
import { ParseArgsConfig } from 'node:util';

import { Command, ActionArgs } from './interface';
import { ThumbnailType } from '../../../sdk/src';

export class CommandPhotoDownloadThumbnails implements Command {
    group = 'photo';
    name = 'download-thumbnails';
    // FIXME: support download of multiple thumbnails
    args = ['path', 'parentLocalPath'];
    options: ParseArgsConfig['options'] = {
        thumbnailType: {
            type: 'string',
            short: 't',
            default: ThumbnailType.Type1.toString(),
        },
    };

    async action({ photosSdk, paths, args: [pathString, parentLocalPath], options: { json, thumbnailType } }: ActionArgs) {
        const nodePath = paths.getPhotoPath(pathString);
        const node = await nodePath.getNode();

        for await (const result of photosSdk.iterateThumbnails([node], parseInt(thumbnailType))) {
            // Thumbnail can be jpeg or webp. All new code should produce webp.
            const thumbnailFileName = `thumbnail-${result.nodeUid}.webp`;
            const thumbnailFilePath = path.join(parentLocalPath, thumbnailFileName);

            if (json) {
                console.log(
                    JSON.stringify({
                        ...result,
                        thumbnail: undefined, // Avoid dumping binary data to JSON.
                        thumbnailFileName,
                    }),
                );
            } else {
                console.log(
                    result.ok
                        ? `Downloaded thumbnail for ${result.nodeUid}`
                        : `Failed to download thumbnail for ${result.nodeUid}: ${result.error}`,
                );
            }

            if (result.ok) {
                await Bun.write(thumbnailFilePath, result.thumbnail);
            }
        }
    }
}
