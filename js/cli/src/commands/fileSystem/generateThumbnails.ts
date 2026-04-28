import type sharp from 'sharp';

import { Thumbnail, ThumbnailType } from '@protontech/drive-sdk';

const MAX_THUMBNAIL_SIDE = 512;
const MAX_THUMBNAIL_BYTES = 64 * 1024 - 512;

const MAX_HD_THUMBNAIL_SIDE = 1920;
const MAX_HD_THUMBNAIL_BYTES = 1024 * 1024 - 512;

const IMAGE_MEDIA_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp',
]);

type SharpLib = typeof sharp;

let sharpPromise: Promise<SharpLib> | undefined;

// Lazy load to avoid requiring the sharp package when not needed.
// It is external dependency that might be missing when running the CLI.
async function loadSharp(): Promise<SharpLib> {
    if (!sharpPromise) {
        sharpPromise = import('sharp')
            .then((m) => (m as { default: SharpLib }).default)
            .catch((error: unknown) => {
                if (error instanceof ResolveMessage) {
                    throw new Error(
                        'Sharp package required for thumbnails generation is not installed. Please install it by running `bun install sharp` in the CLI directory.',
                    );
                }
                throw error;
            });
    }
    return sharpPromise;
}

export async function generateThumbnails(mediaType: string, localPath: string): Promise<Thumbnail[]> {
    if (!IMAGE_MEDIA_TYPES.has(mediaType.trim().toLowerCase())) {
        return [];
    }

    const sharp = await loadSharp();

    const metadata = await sharp(localPath, { failOn: 'none' }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width === 0 || height === 0) {
        return [];
    }

    const type1Buffer = await webpFitMaxBytes(sharp, localPath, MAX_THUMBNAIL_SIDE, MAX_THUMBNAIL_BYTES);
    if (!type1Buffer) {
        return [];
    }

    const thumbnails: Thumbnail[] = [
        {
            type: ThumbnailType.Type1,
            thumbnail: new Uint8Array(type1Buffer),
        },
    ];

    if (shouldGenerateHdThumbnail(width, height, mediaType)) {
        const type2Buffer = await webpFitMaxBytes(sharp, localPath, MAX_HD_THUMBNAIL_SIDE, MAX_HD_THUMBNAIL_BYTES);
        if (type2Buffer) {
            thumbnails.push({
                type: ThumbnailType.Type2,
                thumbnail: new Uint8Array(type2Buffer),
            });
        }
    }

    return thumbnails;
}

function shouldGenerateHdThumbnail(width: number, height: number, mediaType: string): boolean {
    const mt = mediaType.trim().toLowerCase();
    const isJpeg = mt === 'image/jpeg' || mt === 'image/jpg';
    const isWebp = mt === 'image/webp';
    if (Math.max(width, height) > MAX_HD_THUMBNAIL_SIDE) {
        return true;
    }
    return !isJpeg && !isWebp;
}

async function webpFitMaxBytes(
    sharp: SharpLib,
    localPath: string,
    maxSide: number,
    maxBytes: number,
): Promise<Buffer | undefined> {
    let quality = 90;
    let out: Buffer | undefined;
    while (quality > 0) {
        out = await sharp(localPath, { failOn: 'none' })
            .rotate()
            .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality, effort: 4 })
            .toBuffer();
        if (out.length <= maxBytes) {
            break;
        }
        if (quality <= 10) {
            return undefined;
        }
        quality -= 20;
    }
    if (out === undefined) {
        return undefined;
    }
    return out;
}
