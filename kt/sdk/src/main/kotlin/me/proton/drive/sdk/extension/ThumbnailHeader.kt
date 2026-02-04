package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.ThumbnailHeader
import me.proton.drive.sdk.entity.ThumbnailType
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.ThumbnailHeader.toEntity() = ThumbnailHeader(
    id = id,
    type = when (type) {
        ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_THUMBNAIL -> ThumbnailType.THUMBNAIL
        ProtonDriveSdk.ThumbnailType.THUMBNAIL_TYPE_PREVIEW -> ThumbnailType.PREVIEW
        else -> error("Invalid thumbnail type: $type")
    },
)
