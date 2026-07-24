import { DOMParser, onErrorStopParsing } from '@xmldom/xmldom';
import type { ExpandedTags } from 'exifreader';
import ExifReader from 'exifreader';

import { Logger } from '../../interface';
import type { FileLike } from '../interface';
import { isImage, isSVG } from '../mediaTypes';

// Parse XMP metadata with @xmldom/xmldom's parser passed explicitly to ExifReader, rather than
// overwriting the host's global DOMParser. The latter is a module-load side effect that clobbers
// DOMParser for everything else sharing the realm (e.g. jsdom in tests that transitively import this).
const domParser = new DOMParser({ onError: onErrorStopParsing });

export async function getExifInfo(
    file: FileLike,
    mediaType: string,
    logger?: Logger,
): Promise<ExpandedTags | undefined> {
    if (!isImage(mediaType) || isSVG(mediaType)) {
        return undefined;
    }

    const buffer = await file.arrayBuffer();

    try {
        return ExifReader.load(buffer, { expanded: true, domParser });
    } catch (error: unknown) {
        logger?.warn(`Cannot read exif data: ${error instanceof Error ? error.message : String(error)}`);
    }

    return undefined;
}
