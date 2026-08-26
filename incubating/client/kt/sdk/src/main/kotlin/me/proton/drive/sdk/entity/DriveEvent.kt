package me.proton.drive.sdk.entity

/**
 * A remote data update event in an event scope, yielded while enumerating events.
 *
 * Persist [id] as the cursor for the next enumeration after applying the event.
 */
sealed interface DriveEvent {
    val id: DriveEventId

    /** A node was created, updated, moved to/from trash, or made newly accessible. */
    data class NodeUpdated(
        override val id: DriveEventId,
        val nodeUid: NodeUid,
        val parentNodeUid: ParentNodeUid?,
        val isTrashed: Boolean,
        val isShared: Boolean,
    ) : DriveEvent

    /** A node was permanently deleted or made no longer accessible to the user. */
    data class NodeDeleted(
        override val id: DriveEventId,
        val nodeUid: NodeUid,
        val parentNodeUid: ParentNodeUid?,
    ) : DriveEvent

    /** Items shared with the current user changed; refresh the shared-with-me list. */
    data class SharedWithMeUpdated(override val id: DriveEventId) : DriveEvent

    /** The cursor advanced without substantive data changes. */
    data class CursorAdvanced(override val id: DriveEventId) : DriveEvent

    /** Event continuity was lost; mark local state stale and resync from the server. */
    data class ContinuityLost(override val id: DriveEventId) : DriveEvent

    /** Access to the event scope was lost; stop enumerating it and usually drop its local data. */
    data class ScopeAccessLost(override val id: DriveEventId) : DriveEvent
}
