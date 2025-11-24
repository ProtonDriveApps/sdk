package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.ThumbnailType
import proton.drive.sdk.ProtonDriveSdk

fun ThumbnailType.toProto() = when (this) {
    ThumbnailType.THUMBNAIL -> ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_THUMBNAIL
    ThumbnailType.PREVIEW -> ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_PREVIEW
}
