package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.PhotoTagsUpdate
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.photoTagsUpdate

fun PhotoTagsUpdate.toProto(): ProtonDriveSdk.PhotoTagsUpdate = photoTagsUpdate {
    nodeUid = this@toProto.nodeUid.value
    tagsToAdd += this@toProto.tagsToAdd.map { it.toSdkPhotoTag() }
    tagsToRemove += this@toProto.tagsToRemove.map { it.toSdkPhotoTag() }
}
