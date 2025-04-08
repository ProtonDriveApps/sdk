import { Result } from './result';
import { Author } from './author';

/**
 * Node representing a file or folder in the system.
 * 
 * This covers both happy path and degraded path. It is used in the SDK to
 * represent the node in a way that is easy to work with. Whenever any field
 * cannot be decrypted, it is returned as `DegradedNode` type.
 */
export type MaybeNode = Result<NodeEntity, DegradedNode>;

/**
 * Node representing a file or folder in the system, or missing node.
 * 
 * In most cases, SDK returns `MaybeNode`, but in some specific cases, when
 * client is requesting specific nodes, SDK must return `MissingNode` type
 * to indicate the case when the node is not available. That can be when
 * the node does not exist, or when the node is not available for the user
 * (e.g. unshared with the user).
 */
export type MaybeMissingNode = Result<NodeEntity, DegradedNode | MissingNode>;

export type MissingNode = {
    missingUid: string,
};

/**
 * Node representing a file or folder in the system.
 * 
 * This is a happy path representation of the node. It is used in the SDK to
 * represent the node in a way that is easy to work with. Whenever any field
 * cannot be decrypted, it is returned as `DegradedNode` type.
 * 
 * SDK never returns this entity directly but wrapped in `MaybeNode`.
 *
 * Note on naming: Node is reserved by JS/DOM, thus we need exception how the
 * entity is called.
 */
export type NodeEntity = {
    uid: string,
    parentUid?: string,
    name: string,
    /**
     * Author of the node key.
     * 
     * Person who created the node and keys for it. If user A uploads the file
     * and user B renames the file and uploads new revision, name and content
     * author is user B, while key author stays to user A who has forever
     * option to decrypt latest versions.
     */
    keyAuthor: Author,
    /**
     * Author of the name.
     * 
     * Person who named the file. If user A uploads the file and user B renames
     * the file, key and content author is user A, while name author is user B.
     */
    nameAuthor: Author,
    directMemberRole: MemberRole,
    type: NodeType,
    mimeType?: string,
    /**
     * Whether the node is shared. If true, the node is shared with at least
     * one user, or via public link.
     */
    isShared: boolean,
    /**
     * Created on server date.
     */
    createdDate: Date,
    trashedDate?: Date,
    activeRevision?: Revision,
    folder?: {
        claimedModificationTime?: Date,
    },
}

/**
 * Degraded node representing a file or folder in the system.
 * 
 * This is a degraded path representation of the node. It is used in the SDK to
 * represent the node in a way that is easy to work with. Whenever any field
 * cannot be decrypted, it is returned as `DegradedNode` type.
 * 
 * SDK never returns this entity directly but wrapped in `MaybeNode`.
 * 
 * The node can be still used around, but it is not guaranteed that all
 * properties are decrypted, or that all actions can be performed on it.
 * 
 * For example, if the node has issue decrypting the name, the name will be
 * set es `InvalidNameError` and potentially rename or move actions will not be
 * possible, but download and upload new revision will still work.
 */
export type DegradedNode = Omit<NodeEntity, 'name' | 'activeRevision'> & {
    name: Result<string, InvalidNameError>,
    activeRevision?: Result<Revision, Error>,
    /**
     * If the error is not related to any specific field, it is set here.
     * 
     * For example, if the node has issue decrypting the name, the name will be
     * set es `InvalidNameError` that includes the error, while this will be
     * empty.
     * 
     * On the other hand, if the node has issue decrypting the node key, but
     * the name is still working, this will include the node key error, while
     * the name will be set to the decrypted value.
     */
    errors?: unknown[],
}

export type InvalidNameError = {
    /**
     * Placeholder instead of node name that client can use to display.
     */
    name: string,
    error: string,
}

export enum NodeType {
    File = "file",
    Folder = "folder",
}

export enum MemberRole {
    Viewer = "viewer",
    Editor = "editor",
    Admin = "admin",
    Inherited = "inherited",
}

export type Revision = {
    uid: string,
    state: RevisionState,
    createdDate: Date, // created on server date
    contentAuthor: Author,
    claimedSize?: number,
    claimedModificationTime?: Date,
    claimedDigests?: {
        sha1?: string,
    },
    claimedAdditionalMetadata?: object,
}

export enum RevisionState {
    Active = "active",
    Superseded = "superseded",
}

export type NodeOrUid = MaybeNode | NodeEntity | DegradedNode | string;
export type RevisionOrUid = Revision | string;

export type NodeResult =
    {uid: string, ok: true} |
    {uid: string, ok: false, error: string};
