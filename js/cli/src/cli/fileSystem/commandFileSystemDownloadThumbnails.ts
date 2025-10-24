import path from 'node:path';
import { ParseArgsConfig } from 'node:util';

import { MaybeNode, ProtonDriveClient, ThumbnailType } from '../../../../sdk/src';
import { ProtonDrivePhotosClient } from '../../../../sdk/src/protonDrivePhotosClient';
import { Command, ActionArgs } from '../interface';
import { printIterable } from '../formatters';

export class CommandFileSystemDownloadThumbnails implements Command {
    group = 'filesystem';
    name = 'download-thumbnails';
    // FIXME: support download of multiple thumbnails
    args = ['path', 'parentLocalPath'];
    options: ParseArgsConfig['options'] = {
        'thumbnail-type': {
            type: 'string',
            short: 't',
            default: ThumbnailType.Type1.toString(),
        },
    };

    async action({
        paths,
        args: [pathString, parentLocalPath],
        options: { json, 'thumbnail-type': thumbnailType },
    }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const thumbnailsIterator = this.processThumbnails(nodePath.sdk, node, parseInt(thumbnailType), parentLocalPath);
        await printIterable(thumbnailsIterator, json, (result) => {
            console.log(
                result.ok
                    ? `Downloaded thumbnail for ${result.nodeUid}`
                    : `Failed to download thumbnail for ${result.nodeUid}: ${result.error}`,
            );
        });
    }

    private async *processThumbnails(
        sdk: ProtonDriveClient | ProtonDrivePhotosClient,
        node: MaybeNode,
        thumbnailType: ThumbnailType,
        parentLocalPath: string,
    ) {
        for await (const result of sdk.iterateThumbnails([node], thumbnailType)) {
            // Thumbnail can be jpeg or webp. All new code should produce webp.
            const thumbnailFileName = `thumbnail-${result.nodeUid}.webp`;
            const thumbnailFilePath = path.join(parentLocalPath, thumbnailFileName);

            if (result.ok) {
                await Bun.write(thumbnailFilePath, result.thumbnail);
            }

            yield {
                ok: result.ok,
                nodeUid: result.nodeUid,
                error: !result.ok ? result.error : undefined,
                thumbnailFileName,
            };
        }
    }
}
