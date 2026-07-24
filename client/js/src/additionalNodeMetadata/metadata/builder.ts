import type { ExpandedTags } from 'exifreader';

import { convertSubjectAreaToSubjectCoordinates } from '../exifParser/convertSubjectAreaToSubjectCoordinates';
import { getCaptureDateTimeString, getPhotoDimensions } from '../exifParser/exifUtils';
import type { AdditionalNodeMetadata, MediaInfo } from '../interface';

export function buildAdditionalNodeMetadata(
    exifInfo: ExpandedTags | undefined,
    mediaInfo?: MediaInfo
): AdditionalNodeMetadata {
    const { width, height } = exifInfo
        ? getPhotoDimensions(exifInfo)
        : {
              width: mediaInfo?.width,
              height: mediaInfo?.height,
          };

    const photosExtendedAttributes = exifInfo ? getPhotoExtendedAttributes(exifInfo) : undefined;

    return {
        Media: {
            Width: width,
            Height: height,
            Duration: mediaInfo?.duration,
        },
        Location: photosExtendedAttributes?.Location,
        Camera: photosExtendedAttributes?.Camera,
    };
}

const VALID_SUBJECT_AREA_LENGTHS = new Set([2, 3, 4]);

function getPhotoExtendedAttributes({ exif, gps }: ExpandedTags) {
    const captureTime = exif ? getCaptureDateTimeString(exif) : undefined;
    const subjectArea = exif?.SubjectArea?.value;
    const subjectCoordinates =
        subjectArea && VALID_SUBJECT_AREA_LENGTHS.has(subjectArea.length)
            ? convertSubjectAreaToSubjectCoordinates(subjectArea)
            : undefined;

    return {
        Location:
            gps?.Latitude && gps?.Longitude
                ? {
                      Latitude: gps.Latitude,
                      Longitude: gps.Longitude,
                  }
                : undefined,
        Camera: exif
            ? {
                  ...(exif.Model?.value[0] && { Device: exif.Model.value[0] }),
                  ...(exif.Orientation?.value !== undefined && { Orientation: exif.Orientation.value }),
                  ...(captureTime && { CaptureTime: captureTime }),
                  ...(subjectCoordinates && { SubjectCoordinates: subjectCoordinates }),
              }
            : undefined,
    };
}
