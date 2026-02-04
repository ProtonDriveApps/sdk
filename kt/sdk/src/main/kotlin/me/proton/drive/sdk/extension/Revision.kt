package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FileRevision
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.claimedModificationTimeOrNull
import proton.drive.sdk.contentAuthorOrNull

fun ProtonDriveSdk.FileRevision.toEntity() = FileRevision(
    uid = uid,
    creationTime = creationTime.seconds,
    sizeOnCloudStorage = sizeOnCloudStorage,
    claimedSize = if (hasClaimedSize()) claimedSize else null,
    claimedDigests = claimedDigests.toEntity(),
    claimedModificationTime = claimedModificationTimeOrNull?.seconds,
    thumbnails = thumbnailsList.map { it.toEntity() },
    additionalClaimedMetadata = if (additionalClaimedMetadataList.isNotEmpty()) {
        additionalClaimedMetadataList.map { it.toEntity() }
    } else null,
    contentAuthor = contentAuthorOrNull?.toEntity(),
)
