import type { ExifTags, ExpandedTags } from 'exifreader';

import type { FileLike } from '../interface';
import { formatExifDateTime } from './formatExifDateTime';

export function getCaptureDateTime(file: FileLike, exif?: ExifTags): Date {
    const formattedDateTime = getFormattedDateTime(exif);

    // NOTE: From specification (https://drive.gitlab-pages.protontech.ch/documentation/specifications/photos/upload/#revision-commit),
    // the fallback datetime should be the creation time. However in a browser
    // context, the File object has only the last modified time.
    const captureDateTime = new Date(formattedDateTime || file.lastModified);

    if (!isValidDate(captureDateTime)) {
        return new Date();
    }

    return captureDateTime;
}

export function getCaptureDateTimeString(exif?: ExifTags): string | undefined {
    try {
        const formattedDateTime = getFormattedDateTime(exif);
        if (!formattedDateTime) {
            return undefined;
        }

        // Treat EXIF datetime as UTC by appending 'Z'
        const captureDateTime = new Date(`${formattedDateTime}Z`);

        return captureDateTime.toISOString();
    } catch {
        return undefined;
    }
}

export function getPhotoDimensions({ exif, png }: ExpandedTags): { width?: number; height?: number } {
    return {
        width: exif?.ImageWidth?.value || exif?.PixelXDimension?.value || png?.['Image Width']?.value,
        height: exif?.ImageLength?.value || exif?.PixelYDimension?.value || png?.['Image Height']?.value,
    };
}

export function getFormattedDateTime(exif?: ExifTags) {
    if (!exif) {
        return undefined;
    }
    const sources = [exif.DateTimeOriginal, exif.DateTimeDigitized, exif.DateTime];
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        if (!source?.value?.[0]) {
            continue;
        }
        try {
            return formatExifDateTime(source.value[0]);
        } catch {
            continue;
        }
    }
    return undefined;
}

function isValidDate(date: Date) {
    return date instanceof Date && !Number.isNaN(date.getTime());
}
