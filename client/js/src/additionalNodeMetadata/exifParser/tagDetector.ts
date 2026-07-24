import type { ExpandedTags } from 'exifreader';

import { PhotoTag } from '../../interface';
import { detectPortraitFromMakerNote, detectSelfieFromMakerNote, isAppleMakerNote } from '../exifParser/appleMakerNote';
import type { FileLike } from '../interface';
import { getFileExtension, isRAWExtension, isRAWPhoto, isVideo } from '../mediaTypes';

export async function getPhotoTags(file: FileLike, mediaType: string, exifInfo?: ExpandedTags): Promise<PhotoTag[]> {
    const tags: PhotoTag[] = [];

    const extension = getFileExtension(file.name);
    if (isRAWPhoto(mediaType) || isRAWExtension(extension)) {
        tags.push(PhotoTag.Raw);
    }

    if (isVideo(mediaType)) {
        tags.push(PhotoTag.Videos);
    }

    if (!exifInfo || !exifInfo.xmp) {
        return tags;
    }

    const appleMakerNote = isAppleMakerNote(exifInfo.exif?.MakerNote);

    if (
        (exifInfo.xmp.UserComment && exifInfo.xmp.UserComment.value === 'Screenshot') ||
        file.name?.toLowerCase().includes('screenshot')
    ) {
        tags.push(PhotoTag.Screenshots);
    }

    if (exifInfo.xmp.ProjectionType && exifInfo.xmp.ProjectionType.value === 'equirectangular') {
        tags.push(PhotoTag.Panoramas);
    }

    if (exifInfo.xmp.MotionPhoto && exifInfo.xmp.MotionPhoto.value === '1') {
        tags.push(PhotoTag.MotionPhotos);
    }

    const isAndroidPortrait =
        exifInfo.xmp.SpecialTypeID &&
        exifInfo.xmp.SpecialTypeID.value &&
        (exifInfo.xmp.SpecialTypeID.value ===
            'com.google.android.apps.camera.gallery.specialtype.SpecialType-PORTRAIT' ||
            (Array.isArray(exifInfo.xmp.SpecialTypeID.value) &&
                exifInfo.xmp.SpecialTypeID.value.some(
                    (v) => v.value === 'com.google.android.apps.camera.gallery.specialtype.SpecialType-PORTRAIT',
                )));

    if (isAndroidPortrait || (appleMakerNote && detectPortraitFromMakerNote(appleMakerNote))) {
        tags.push(PhotoTag.Portraits);
    }

    if (appleMakerNote && detectSelfieFromMakerNote(appleMakerNote)) {
        tags.push(PhotoTag.Selfies);
    }

    return tags;
}
