export type { AdditionalNodeMetadata } from './interface';
export { parseAdditionalNodeMetadata } from './metadata/parser';

import type { Logger, PhotoTag } from '../interface';
import { getExifInfo } from './exifParser/exifParser';
import { getCaptureDateTime } from './exifParser/exifUtils';
import { getPhotoTags } from './exifParser/tagDetector';
import type { AdditionalNodeMetadata, FileLike, MediaInfo } from './interface';
import { buildAdditionalNodeMetadata } from './metadata/builder';

/**
 * Generates additional node metadata for regular Drive files.
 *
 * This function extracts EXIF data from the file (if available) and builds
 * metadata including media dimensions, GPS location, and camera information.
 * It does NOT include photo tags or capture time - use
 * `generatePhotosExtendedAttributes` for those.
 *
 * @param file - The file to process
 * @param mediaType - The detected media type of the file
 * @param mediaInfo - Optional media information (width, height, duration)
 * @returns Promise that resolves to an object containing:
 *   - `metadata`: Extended attributes (Media, Location, Camera)
 *
 * @example
 * ```typescript
 * const { metadata } = await generateExtendedAttributes(file, 'image/jpeg', {
 *     width: 1920,
 *     height: 1080
 * });
 * ```
 */
export async function generateAdditionalNodeMetadata(
    file: FileLike,
    mediaType: string,
    mediaInfo?: MediaInfo,
    logger?: Logger,
): Promise<{ additionalMetadata: AdditionalNodeMetadata }> {
    const exifInfo = await getExifInfo(file, mediaType, logger);
    const additionalMetadata = buildAdditionalNodeMetadata(exifInfo, mediaInfo);
    return { additionalMetadata };
}

/**
 * Generates additional photo node metadata for Photos files.
 *
 * This function extracts EXIF data from the file (if available) and builds
 * metadata including media dimensions, GPS location, and camera information.
 * It also includes photo tags and capture time.
 *
 * Use this for file in Photos section. For regular Drive files,
 * use `generateAdditionalNodeMetadata` instead.
 *
 * @param file - The photo/video file to process
 * @param mediaType - The detected media type of the file
 * @param mediaInfo - Optional media information (width, height, duration)
 * @returns Promise that resolves to an object containing:
 *   - `metadata`: Extended attributes (Media, Location, Camera)
 *   - `tags`: Array of detected photo tags (PhotoTag enum values)
 *   - `captureTime`: Date when the photo was captured
 *
 * @example
 * ```typescript
 * const { metadata, tags, captureTime } = await generatePhotosExtendedAttributes(file, 'image/jpeg', {
 *     width: 1920,
 *     height: 1080
 * });
 * ```
 */
export async function generateAdditionalPhotoNodeMetadata(
    file: FileLike,
    mediaType: string,
    mediaInfo?: MediaInfo,
    logger?: Logger,
): Promise<{
    additionalMetadata: AdditionalNodeMetadata;
    tags: PhotoTag[];
    captureTime: Date;
}> {
    const exifInfo = await getExifInfo(file, mediaType, logger);
    const additionalMetadata = buildAdditionalNodeMetadata(exifInfo, mediaInfo);
    const tags: PhotoTag[] = await getPhotoTags(file, mediaType, exifInfo);
    const captureTime = getCaptureDateTime(file, exifInfo?.exif);

    return {
        additionalMetadata,
        tags,
        captureTime,
    };
}
