/// How `ProtonPhotosClient.deleteAlbum` treats photos that exist only in the album (not in the timeline).
public enum AlbumDeletionConfig: Sendable {
    /// Throws error code 200302 with `AlbumContainsPhotosNotInTimelineErrorData` when the album contains photos not in the timeline.
    case failIfContainsPhotosNotInTimeline
    /// Permanently deletes the photos that exist only in the album, then deletes the album.
    case force
    /// Moves the photos that exist only in the album to the timeline, then deletes the album.
    case saveToTimeline
}
