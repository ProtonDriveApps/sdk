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
    missingUid: string;
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
    uid: string;
    parentUid?: string;
    name: string;
    /**
     * Author of the node key.
     *
     * Person who created the node and keys for it. If user A uploads the file
     * and user B renames the file and uploads new revision, name and content
     * author is user B, while key author stays to user A who has forever
     * option to decrypt latest versions.
     */
    keyAuthor: Author;
    /**
     * Author of the name.
     *
     * Person who named the file. If user A uploads the file and user B renames
     * the file, key and content author is user A, while name author is user B.
     */
    nameAuthor: Author;
    /**
     * Role set directly on the node. If not set, the role is inherited from
     * the parent node. Client must traverse the tree to get the actual role.
     * Actual role should be the highest role available in the tree.
     */
    directRole: MemberRole;
    /**
     * Membership information set directly on the node. If not set, the
     * membership is inherited from the parent node.
     */
    membership?: Membership;
    type: NodeType;
    mediaType?: string;
    /**
     * Whether the node is shared. If true, the node is shared with at least
     * one user, or via public link.
     */
    isShared: boolean;
    /**
     * Whether the node is publicly shared. If true, the node is shared via public link.
     */
    isSharedPublicly: boolean;
    /**
     * Provides the ID of the share that the node is shared with.
     *
     * This is required only for the internal implementation to provide
     * backward compatibility with the old Drive web setup.
     *
     * @deprecated This field is not part of the public API.
     */
    deprecatedShareId?: string;
    /**
     * Created on server date.
     */
    creationTime: Date;
    /**
     * Modified on server (renamed, moved, etc.).
     */
    modificationTime: Date;
    trashTime?: Date;
    /**
     * Total size of all revisions, encrypted size on the server.
     */
    totalStorageSize?: number;
    activeRevision?: Revision;
    folder?: {
        claimedModificationTime?: Date;
    };
    /**
     * Provides an ID for the event scope.
     *
     * By subscribing to events in a scope, all updates to nodes
     * withing that scope will be passed to the client. The scope can
     * comprise one or more folder trees and will be shared by all
     * nodes in the tree. Nodes cannot change scopes.
     */
    treeEventScopeId: string;
};

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
 * set as `Error` and potentially rename or move actions will not be
 * possible, but download and upload new revision will still work.
 */
export type DegradedNode = Omit<NodeEntity, 'name' | 'activeRevision'> & {
    name: Result<string, Error | InvalidNameError>;
    activeRevision?: Result<Revision, Error>;
    /**
     * If the error is not related to any specific field, it is set here.
     *
     * For example, if the node has issue decrypting the name, the name will be
     * set as `Error` while this will be empty.
     *
     * On the other hand, if the node has issue decrypting the node key, but
     * the name is still working, this will include the node key error, while
     * the name will be set to the decrypted value.
     */
    errors?: unknown[];
};

/**
 * Invalid name error represents node name that includes invalid characters.
 */
export type InvalidNameError = {
    /**
     * Placeholder instead of node name that client can use to display.
     */
    name: string;
    error: string;
};

export enum NodeType {
    File = 'file',
    Folder = 'folder',
    /**
     * Album is a special type available only in Photos section.
     *
     * The SDK does not support any album-specific actions, but it can load
     * the node and do general operations on it, such as sharing. However,
     * you should not rely that anything can work. It is not guaranteed that
     * and in the future specific Photos SDK will support albums.
     *
     * @deprecated This type is not part of the public API.
     */
    Album = 'album',
}

export type Membership = {
    role: MemberRole;
    /**
     * Date when the node was shared with the user.
     */
    inviteTime: Date;
    /**
     * Author who shared the node with the user.
     *
     * If the author cannot be verified, it means that the invitation could
     * be forged by bad actor. User should be warned before accepting
     * the invitation or opening the shared content.
     */
    sharedBy: Author;
    // TODO: acceptedBy: Author;
};

export enum MemberRole {
    Viewer = 'viewer',
    Editor = 'editor',
    Admin = 'admin',
    Inherited = 'inherited',
}

export type Revision = {
    uid: string;
    state: RevisionState;
    creationTime: Date; // created on server date
    contentAuthor: Author;
    /**
     * Encrypted size of the revision, as stored on the server.
     */
    storageSize: number;
    /**
     * Raw size of the revision, as stored in extended attributes.
     */
    claimedSize?: number;
    /**
     * Modification time on the file system.
     */
    claimedModificationTime?: Date;
    claimedDigests?: {
        sha1?: string;
    };
    claimedAdditionalMetadata?: object;
};

export enum RevisionState {
    Active = 'active',
    Superseded = 'superseded',
}

export type NodeOrUid = MaybeNode | NodeEntity | DegradedNode | string;
export type RevisionOrUid = Revision | string;

// TODO: Remove string from the result and use Error instead to be compatible with the NodeResultWithNewUid.
export type NodeResult = { uid: string; ok: true } | { uid: string; ok: false; error: string };
export type NodeResultWithNewUid = { uid: string; newUid: string; ok: true } | { uid: string; ok: false; error: Error };
