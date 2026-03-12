package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.PhotoTag
import proton.drive.sdk.ProtonDriveSdk.PhotoTag as SdkPhotoTag

fun PhotoTag.toSdkPhotoTag(): SdkPhotoTag = when (this) {
    PhotoTag.Favorite -> SdkPhotoTag.PHOTO_TAG_FAVORITE
    PhotoTag.Screenshot -> SdkPhotoTag.PHOTO_TAG_SCREENSHOT
    PhotoTag.Video -> SdkPhotoTag.PHOTO_TAG_VIDEO
    PhotoTag.LivePhoto -> SdkPhotoTag.PHOTO_TAG_LIVE_PHOTO
    PhotoTag.MotionPhoto -> SdkPhotoTag.PHOTO_TAG_MOTION_PHOTO
    PhotoTag.Selfie -> SdkPhotoTag.PHOTO_TAG_SELFIE
    PhotoTag.Portrait -> SdkPhotoTag.PHOTO_TAG_PORTRAIT
    PhotoTag.Burst -> SdkPhotoTag.PHOTO_TAG_BURST
    PhotoTag.Panorama -> SdkPhotoTag.PHOTO_TAG_PANORAMA
    PhotoTag.Raw -> SdkPhotoTag.PHOTO_TAG_RAW
}
