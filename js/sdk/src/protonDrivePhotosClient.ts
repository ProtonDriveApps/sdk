export const protonDrivePhotosClient = () => {
    // TODO: this is only example, on background it use drive internals, but it exposes nice interface for photos
    return {
        // Timeline or album view
        iterateTimelinePhotos: () => {}, // returns only UIDs and dates - used to show grid and scrolling
        iterateAlbumPhotos: () => {}, // same as above but for album
        iterateThumbnails: () => {}, // returns thumbnails for passed photos that are visible in the UI
        getPhoto: () => {}, // returns full photo details

        // Album management
        createAlbum: () => {},
        renameAlbum: () => {},
        shareAlbum: () => {},
        deleteAlbum: () => {},
        iterateAlbums: () => {},
        addPhotosToAlbum: () => {},
    }
}
