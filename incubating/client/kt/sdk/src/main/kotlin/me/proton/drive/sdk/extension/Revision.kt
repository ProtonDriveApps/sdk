package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FileRevision
import me.proton.drive.sdk.entity.RevisionState
import me.proton.drive.sdk.entity.RevisionUid
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.claimedDigestsOrNull
import proton.drive.sdk.contentAuthorOrNull

fun ProtonDriveSdk.FileRevision.toEntity() = FileRevision(
    uid = RevisionUid(uid),
    state = when (state) {
        ProtonDriveSdk.RevisionState.REVISION_STATE_ACTIVE -> RevisionState.ACTIVE
        ProtonDriveSdk.RevisionState.REVISION_STATE_SUPERSEDED -> RevisionState.SUPERSEDED
        else -> error("Invalid revision state: $state")
    },
    creationTime = creationTime.toInstant(),
    storageSize = storageSize,
    claimedSize = if (hasClaimedSize()) claimedSize else null,
    claimedDigests = claimedDigestsOrNull?.toEntity(),
    claimedModificationTime = if (hasClaimedModificationTime()) claimedModificationTime.toOffsetDateTime() else null,
    thumbnails = thumbnailsList.map { it.toEntity() },
    claimedAdditionalMetadata = if (claimedAdditionalMetadataList.isNotEmpty()) {
        claimedAdditionalMetadataList.map { it.toEntity() }
    } else null,
    contentAuthor = contentAuthorOrNull?.toEntity(),
)
