import { Result } from './result';
import { Author } from './author';

// Note: Node is reserved by JS/DOM, thus we need exception how the entity is called
export type NodeEntity = {
    uid: string,
    parentUid?: string,
    name: Result<string, InvalidNameError>,
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
    activeRevision?: Result<Revision, Error>,
    folder?: {
        claimedModificationTime?: Date,
    },
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

export type NodeOrUid = NodeEntity | string;
export type RevisionOrUid = Revision | string;

export type NodeResult =
    {uid: string, ok: true} |
    {uid: string, ok: false, error: string};
