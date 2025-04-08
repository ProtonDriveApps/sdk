import { Result } from './result';
import { UnverifiedAuthorError } from './author';
import { NodeType, MemberRole, InvalidNameError } from './nodes';

export type Member = {
    uid: string,
    invitedDate: Date,
    addedByEmail: Result<string, UnverifiedAuthorError>,
    inviteeEmail: string,
    role: MemberRole,
}

export type ProtonInvitation = Member;

export type ProtonInvitationWithNode = ProtonInvitation & {
    node: {
        name: Result<string, InvalidNameError>,
        type: NodeType,
        mimeType?: string,
    },
}

export type NonProtonInvitation = ProtonInvitation & {
    state: NonProtonInvitationState,
}

export enum NonProtonInvitationState {
    Pending = "pending",
    UserRegistered = "userRegistered",
}

export type PublicLink = {
    uid: string,
    createDate: Date,
    role: MemberRole,
    url: string,
    customPassword?: string,
    expireDate?: Date,
}

export type Bookmark = {
    uid: string,
    bookmarkedDate: Date,
    node: {
        name: Result<string, InvalidNameError>,
        type: NodeType,
        mimeType?: string,
    },
}

export type ProtonInvitationOrUid = ProtonInvitation | string;
export type NonProtonInvitationOrUid = NonProtonInvitation | string;
export type BookmarkOrUid = Bookmark | string;

export type ShareNodeSettings = {
    users?: ShareMembersSettings,
    publicLink?: SharePublicLinkSettings,
    emailOptions?: {
        message?: string,
        includeNodeName?: boolean,
    },
}

export type ShareMembersSettings = string[] | {
    email: string,
    role: MemberRole,
}[];

export type SharePublicLinkSettings = boolean |{
    role: MemberRole,
    customPassword?: string | null | undefined,
    expiration?: Date | null | undefined,
};

export type ShareResult = {
    protonInvitations: ProtonInvitation[],
    nonProtonInvitations: NonProtonInvitation[],
    members: Member[],
    publicLink?: PublicLink,
}

export type UnshareNodeSettings = {
    users?: string[],
    publicLink?: 'remove',
};
