package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.DriveEvent
import me.proton.drive.sdk.entity.DriveEventId
import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.ParentNodeUid
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.DriveEvent.toEntity(): DriveEvent {
    val eventId = DriveEventId(id)
    return when (eventCase) {
        ProtonDriveSdk.DriveEvent.EventCase.NODE_UPDATED -> DriveEvent.NodeUpdated(
            id = eventId,
            nodeUid = NodeUid(nodeUpdated.nodeUid),
            parentNodeUid = nodeUpdated.parentNodeUid
                .takeIf { nodeUpdated.hasParentNodeUid() }
                ?.let(::ParentNodeUid),
            isTrashed = nodeUpdated.isTrashed,
            isShared = nodeUpdated.isShared,
        )
        ProtonDriveSdk.DriveEvent.EventCase.NODE_DELETED -> DriveEvent.NodeDeleted(
            id = eventId,
            nodeUid = NodeUid(nodeDeleted.nodeUid),
            parentNodeUid = nodeDeleted.parentNodeUid
                .takeIf { nodeDeleted.hasParentNodeUid() }
                ?.let(::ParentNodeUid),
        )
        ProtonDriveSdk.DriveEvent.EventCase.SHARED_WITH_ME_UPDATED -> DriveEvent.SharedWithMeUpdated(eventId)
        ProtonDriveSdk.DriveEvent.EventCase.CURSOR_ADVANCED -> DriveEvent.CursorAdvanced(eventId)
        ProtonDriveSdk.DriveEvent.EventCase.CONTINUITY_LOST -> DriveEvent.ContinuityLost(eventId)
        ProtonDriveSdk.DriveEvent.EventCase.SCOPE_ACCESS_LOST -> DriveEvent.ScopeAccessLost(eventId)
        ProtonDriveSdk.DriveEvent.EventCase.EVENT_NOT_SET, null -> error("Invalid DriveEvent: event not set")
    }
}
