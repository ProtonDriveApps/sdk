import { Result } from './result.js';
import { NodeEntity, NodeOrUid, MemberRole, InvalidNameError, UnverifiedAuthorError } from './nodes.js';

export type ProtonInvitation = {
    uid: string,
    nodeName: Result<string, InvalidNameError>,
    invitedDate: Date,
    addedByEmail: Result<string, UnverifiedAuthorError>,
    inviteeEmail: string,
    role: MemberRole,
}

export type NonProtonInvitation = {
    uid: string,
    nodeName: Result<string, InvalidNameError>,
    invitedDate: Date,
    addedByEmail: Result<string, UnverifiedAuthorError>,
    inviteeEmail: string,
    role: MemberRole,
    state: NonProtonInvitationState,
}

export enum NonProtonInvitationState {
    Pending = "pending",
    UserRegistered = "userRegistered",
}

export type Member = {
    uid: string,
    invitedDate: Date,
    addedByEmail: Result<string, UnverifiedAuthorError>,
    inviteeEmail: string,
    role: MemberRole,
}

export type PublicLink = {
    uid: string,
    createDate: string,
    role: MemberRole,
    url: string,
    password: string,
    customPassword: string,
    expirationDate: Date,
}

export type Bookmark = {
    uid: string,
    nodeName: Result<string, Error>,
    bookmarkedDate: Date,
    rootNodeUid: string,
}

export type ProtonInvitationOrUid = ProtonInvitation | string;
export type NonProtonInvitationOrUid = NonProtonInvitation | string;
export type BookmarkOrUid = Bookmark | string;

export interface Sharing {
    iterateInvitations(signal?: AbortSignal): Promise<ProtonInvitation | NonProtonInvitation>,
    acceptInvitation(invitationUid: ProtonInvitationOrUid): Promise<void>,
    rejectInvitation(invitationUid: ProtonInvitationOrUid): Promise<void>,

    iterateSharedNodes(signal?: AbortSignal): AsyncGenerator<NodeEntity>,
    iterateSharedNodesWithMe(signal?: AbortSignal): AsyncGenerator<NodeEntity>,
    leaveSharedNode(nodeUid: NodeOrUid): void,

    iterateBookmarks(signal?: AbortSignal): AsyncGenerator<Bookmark>,
    removeBookmark(bookmarkUid: BookmarkOrUid): Promise<void>,
}

export interface SharingManagement {
    shareNode(nodeUid: NodeOrUid, settings: ShareNodeSettings): Promise<ShareResult>,
    unshareNode(nodeUid: NodeOrUid, settings?: UnshareNodeSettings): Promise<ShareResult>,
    resendInvitation(invitationUid: ProtonInvitationOrUid | NonProtonInvitationOrUid): Promise<void>,
}

export type ShareNodeSettings = {
    protonUsers?: ShareMembersSettings,
    nonProtonUsers?: ShareMembersSettings,
    publicLink?: boolean | {
        role: ShareRole,
        customPassword?: string | null | undefined,
        expiration?: Date | null | undefined,
    }
}

export type ShareMembersSettings = string[] | {
    email: string,
    role: ShareRole,
}[];

export enum ShareRole {
    VIEW = 'view',
    EDIT = 'edit',
};

export type ShareResult = {
    protonInitations: ProtonInvitation[],
    nonProtonInvitations: NonProtonInvitation[],
    members: Member[],
    publicLink?: PublicLink
}

export type UnshareNodeSettings = {
    users?: string[],
    publicLink?: 'remove',
};
