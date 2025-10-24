import path from 'node:path';
import { ParseArgsConfig } from 'node:util';

import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { MaybeNode, ThumbnailType } from '../../../../sdk/src';
import { PUBLIC_OPTIONS } from './base';
import { ProtonDrivePublicLinkClient } from '../../../../sdk/src/protonDrivePublicLinkClient';

export class CommandPublicDownloadThumbnails implements Command {
    group = 'public';
    name = 'download-thumbnails';
    args = ['path', 'parentLocalPath'];
    options: ParseArgsConfig['options'] = {
        'thumbnail-type': {
            type: 'string',
            short: 't',
            default: ThumbnailType.Type1.toString(),
        },
        ...PUBLIC_OPTIONS,
    };

    async action({
        paths,
        args: [pathString, parentLocalPath],
        options: { json, 'thumbnail-type': thumbnailType, url, 'custom-password': customPassword },
    }: ActionArgs) {
        const client = await paths.authPublicLinkSession(url, customPassword);
        const nodePath = paths.getPublicLinkPath(pathString);
        const node = await nodePath.getNode();

        const thumbnailsIterator = this.processThumbnails(client, node, parseInt(thumbnailType), parentLocalPath);
        await printIterable(thumbnailsIterator, json, (result) => {
            console.log(
                result.ok
                    ? `Downloaded thumbnail for ${result.nodeUid}`
                    : `Failed to download thumbnail for ${result.nodeUid}: ${result.error}`,
            );
        });
    }

    private async *processThumbnails(
        sdk: ProtonDrivePublicLinkClient,
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
