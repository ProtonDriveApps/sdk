import { Result } from "./result";
import { DegradedNode, NodeEntity, NodeType, MissingNode } from "./nodes";

/**
 * Node representing a photo or album for Photos SDK.
 *
 * See `MaybeNode` for more information.
 */
export type MaybePhotoNode = Result<PhotoNode, DegradedPhotoNode>;

/**
 * Node representing a photo or album, or missing node for Photos SDK.
 *
 * See `MaybeMissingNode` for more information.
 */
export type MaybeMissingPhotoNode = Result<PhotoNode, DegradedPhotoNode | MissingNode>;

/**
 * Node representing a photo or album for Photos SDK.
 *
 * See `NodeEntity` for more information.
 */
export type PhotoNode = NodeEntity & {
    type: NodeType.Photo | NodeType.Album;
    photo?: PhotoAttributes;
    album?: AlbumAttributes;
};

/**
 * Degraded node representing a photo or album for Photos SDK.
 *
 * See `DegradedNode` for more information.
 */
export type DegradedPhotoNode = DegradedNode & {
    photo?: PhotoAttributes;
    album?: AlbumAttributes;
};

/**
 * Attributes of a photo.
 *
 * Only nodes of type `NodeType.Photo` have property of this type.
 */
export type PhotoAttributes = {
    /**
     * Date used for sorting in the photo timeline.
     */
    captureTime: Date;
    /**
     * Photo can consist of multiple photos or vidoes (e.g., live photo).
     * Only the main photos are iterated and each main photo will have
     * set the list of related photo UIDs that client can use to load
     * the related photos. All the related photos will have set the
     * main photo UID.
     */
    mainPhotoNodeUid?: string;
    relatedPhotoNodeUids: string[];
    /**
     * List of albums in which the photo is included.
     */
    albums: {
        nodeUid: string;
        additionTime: Date;
    }[];
    /**
     * List of tags assigned to the photo.
     */
    tags: PhotoTag[];
};

export enum PhotoTag {
    Favorites = 0,
    Screenshots = 1,
    Videos = 2,
    LivePhotos = 3,
    MotionPhotos = 4,
    Selfies = 5,
    Portraits = 6,
    Bursts = 7,
    Panoramas = 8,
    Raw = 9,
}

/**
 * Attributes of an album.
 *
 * Only nodes of type `NodeType.Album` have property of this type.
 */
export type AlbumAttributes = {
    /**
     * Number of photos in the album.
     */
    photoCount: number;
    /**
     * UID of the cover photo node of the album.
     */
    coverPhotoNodeUid?: string;
}
