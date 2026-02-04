package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DegradedRevision
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.claimedDigestsOrNull
import proton.drive.sdk.claimedModificationTimeOrNull
import proton.drive.sdk.contentAuthorOrNull

fun ProtonDriveSdk.DegradedRevision.toEntity() = DegradedRevision(
    uid = uid,
    creationTime = creationTime.seconds,
    sizeOnCloudStorage = sizeOnCloudStorage,
    claimedSize = if (hasClaimedSize()) claimedSize else null,
    claimedDigests = claimedDigestsOrNull?.toEntity(),
    claimedModificationTime = claimedModificationTimeOrNull?.seconds,
    thumbnails = thumbnailsList.map { it.toEntity() },
    additionalClaimedMetadata = if (additionalClaimedMetadataList.isNotEmpty()) {
        additionalClaimedMetadataList.map { it.toEntity() }
    } else null,
    contentAuthor = contentAuthorOrNull?.toEntity(),
    canDecrypt = canDecrypt,
    errors = errorsList.map { it.toEntity() },
)
