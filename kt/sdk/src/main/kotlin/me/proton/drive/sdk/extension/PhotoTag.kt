package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.PhotoTag
import proton.drive.sdk.ProtonDriveSdk.PhotoTag as SdkPhotoTag

fun PhotoTag.toSdkPhotoTag(): SdkPhotoTag = when (this) {
    PhotoTag.Favorites -> SdkPhotoTag.PHOTO_TAG_FAVORITES
    PhotoTag.Screenshots -> SdkPhotoTag.PHOTO_TAG_SCREENSHOTS
    PhotoTag.Videos -> SdkPhotoTag.PHOTO_TAG_VIDEOS
    PhotoTag.LivePhotos -> SdkPhotoTag.PHOTO_TAG_LIVE_PHOTOS
    PhotoTag.MotionPhotos -> SdkPhotoTag.PHOTO_TAG_MOTION_PHOTOS
    PhotoTag.Selfies -> SdkPhotoTag.PHOTO_TAG_SELFIES
    PhotoTag.Portraits -> SdkPhotoTag.PHOTO_TAG_PORTRAITS
    PhotoTag.Bursts -> SdkPhotoTag.PHOTO_TAG_BURSTS
    PhotoTag.Panoramas -> SdkPhotoTag.PHOTO_TAG_PANORAMAS
    PhotoTag.Raw -> SdkPhotoTag.PHOTO_TAG_RAW
}
