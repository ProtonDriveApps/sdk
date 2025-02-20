import { Result } from './result.js';

// Note: Node is reserved by JS/DOM, thus we need exception how the entity is called
export type NodeEntity = {
    uid: string,
    parentUid?: string,
    name: Result<string, InvalidNameError>,
    keyAuthor: Result<string | AnonymousUser, UnverifiedAuthorError>,
    nameAuthor: Result<string | AnonymousUser, UnverifiedAuthorError>,
    directMemberRole: MemberRole,
    type: NodeType,
    mimeType?: string,
    isShared: boolean,
    createdDate: Date, // created on server date
    trashedDate?: Date,
    activeRevision?: Result<Revision, Error>,
}

export type InvalidNameError = {
    name: string, // placeholder instead of node name
    error: string,
}

export type UnverifiedAuthorError = {
    claimedAuthor?: string,
    error: string,
}

export type AnonymousUser = null;

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
    author: Result<string | AnonymousUser, UnverifiedAuthorError>,
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

export interface Nodes {
    getNodeUid(shareId: string, nodeId: string): Promise<string>; // deprected right away
    getMyFilesRootFolder(): Promise<NodeEntity>,
    iterateChildren(parentNodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<NodeEntity>,
    iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeEntity>,
}

export interface NodesManagement {
    createFolder(parentNodeUid: NodeOrUid, name: string): Promise<NodeEntity>,
    renameNode(nodeUid: NodeOrUid, newName: string): Promise<NodeEntity>,
    moveNodes(nodeUids: NodeOrUid[], newParentNodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<NodeResult>,
    trashNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult>,
    restoreNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult>,
}

export interface TrashManagement {
    iterateTrashedNodes(signal?: AbortSignal): AsyncGenerator<NodeEntity>,
    deleteNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult>,
    emptyTrash(): Promise<void>,
}

export interface Revisions {
    iterateRevisions(nodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<Revision>,
    restoreRevision(revisionUid: RevisionOrUid): Promise<void>,
    deleteRevision(revisionUid: RevisionOrUid): Promise<void>,
}

export type NodeResult = {uid: string, ok: true} | {uid: string, ok: false, error: string};
