import { createJimp } from '@jimp/core';
import bmp, { msBmp } from '@jimp/js-bmp';
import gif from '@jimp/js-gif';
import jpeg from '@jimp/js-jpeg';
import png from '@jimp/js-png';
import tiff from '@jimp/js-tiff';
import * as resize from '@jimp/plugin-resize';

import { Thumbnail, ThumbnailType } from '../../../../sdk/src';

const Jimp = createJimp({
    formats: [bmp, msBmp, gif, jpeg, png, tiff],
    plugins: [resize.methods],
});

const MAX_UPLOAD_THUMBNAIL_SIDE = 512;
const MAX_THUMBNAIL_BYTES = 64 * 1024 - 512;

const IMAGE_MEDIA_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
]);

export async function generateThumbnails(mediaType: string, localPath: string): Promise<Thumbnail[]> {
    if (!IMAGE_MEDIA_TYPES.has(mediaType.trim().toLowerCase())) {
        return [];
    }

    try {
        const file = await Bun.file(localPath).arrayBuffer();
        const image = await Jimp.read(Buffer.from(file));
        image.scaleToFit({ w: MAX_UPLOAD_THUMBNAIL_SIDE, h: MAX_UPLOAD_THUMBNAIL_SIDE });

        let quality = 90;
        let thumbnailBuffer: Buffer | undefined;
        while (quality > 0) {
            thumbnailBuffer = await image.getBuffer('image/jpeg', { quality });
            if (thumbnailBuffer.length <= MAX_THUMBNAIL_BYTES || quality <= 10) {
                break;
            }
            quality -= 20;
        }
        if (!thumbnailBuffer) {
            return [];
        }
        return [
            {
                type: ThumbnailType.Type1,
                thumbnail: new Uint8Array(thumbnailBuffer),
            },
        ];
    } catch {
        return [];
    }
}
