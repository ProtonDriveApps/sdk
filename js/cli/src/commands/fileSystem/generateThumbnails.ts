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

export async function generateThumbnails(mediaType: string, localPath: string): Promise<Thumbnail[]> {
    if (!IMAGE_MEDIA_TYPES.has(mediaType.trim().toLowerCase())) {
        return [];
    }

    const metadata = await imageFromPath(localPath).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (width === 0 || height === 0) {
        return [];
    }

    const type1Buffer = await webpFitMaxBytes(localPath, MAX_THUMBNAIL_SIDE, MAX_THUMBNAIL_BYTES);
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
        const type2Buffer = await webpFitMaxBytes(localPath, MAX_HD_THUMBNAIL_SIDE, MAX_HD_THUMBNAIL_BYTES);
        if (type2Buffer) {
            thumbnails.push({
                type: ThumbnailType.Type2,
                thumbnail: new Uint8Array(type2Buffer),
            });
        }
    }

    return thumbnails;
}

function imageFromPath(localPath: string): Bun.Image {
    return new Bun.Image(localPath, { autoOrient: true });
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

async function webpFitMaxBytes(localPath: string, maxSide: number, maxBytes: number): Promise<Buffer | undefined> {
    let quality = 90;
    let out: Buffer | undefined;
    while (quality > 0) {
        try {
            out = await imageFromPath(localPath)
                .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality })
                .buffer();
        } catch {
            return undefined;
        }
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
