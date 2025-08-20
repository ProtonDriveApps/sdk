import { Result } from './result';
import { UnverifiedAuthorError } from './author';
import { NodeType, MemberRole, InvalidNameError } from './nodes';

export type Member = {
    uid: string;
    invitationTime: Date;
    addedByEmail: Result<string, UnverifiedAuthorError>;
    inviteeEmail: string;
    role: MemberRole;
};

export type ProtonInvitation = Member;

export type ProtonInvitationWithNode = ProtonInvitation & {
    node: {
        uid: string;
        name: Result<string, Error | InvalidNameError>;
        type: NodeType;
        mediaType?: string;
    };
};

export type NonProtonInvitation = ProtonInvitation & {
    state: NonProtonInvitationState;
};

export enum NonProtonInvitationState {
    Pending = 'pending',
    UserRegistered = 'userRegistered',
}

export type PublicLink = {
    uid: string;
    creationTime: Date;
    role: MemberRole;
    url: string;
    customPassword?: string;
    expirationTime?: Date;
    numberOfInitializedDownloads: number;
};

/**
 * Bookmark representing a saved link to publicly shared node.
 *
 * This covers both happy path and degraded path.
 */
export type MaybeBookmark = Result<Bookmark, DegradedBookmark>;

export type Bookmark = {
    uid: string;
    creationTime: Date;
    url: string;
    customPassword?: string;
    node: {
        name: string;
        type: NodeType;
        mediaType?: string;
    };
};

/**
 * Degraded bookmark representing a saved link to publicly shared node.
 *
 * This is a degraded path representation of the bookmark. It is used in the
 * SDK to represent the bookmark in a way that is easy to work with. Whenever
 * any field cannot be decrypted, it is returned as `DegradedBookmark` type.
 */
export type DegradedBookmark = Omit<Bookmark, 'url' | 'customPassword' | 'node'> & {
    url: Result<string, Error>;
    customPassword: Result<string | undefined, Error>;
    node: Omit<Bookmark['node'], 'name'> & {
        name: Result<string, Error | InvalidNameError>;
    };
};

export type ProtonInvitationOrUid = ProtonInvitation | string;
export type NonProtonInvitationOrUid = NonProtonInvitation | string;
export type BookmarkOrUid = Bookmark | string;

export type ShareNodeSettings = {
    users?: ShareMembersSettings;
    publicLink?: SharePublicLinkSettings;
    emailOptions?: {
        message?: string;
        includeNodeName?: boolean;
    };
};

export type ShareMembersSettings =
    | string[]
    | {
          email: string;
          role: MemberRole;
      }[];

export type SharePublicLinkSettings = boolean | SharePublicLinkSettingsObject;

export type SharePublicLinkSettingsObject = {
    role: MemberRole;
    customPassword?: string | undefined;
    expiration?: Date | undefined;
};

export type ShareResult = {
    protonInvitations: ProtonInvitation[];
    nonProtonInvitations: NonProtonInvitation[];
    members: Member[];
    publicLink?: PublicLink;
};

export type UnshareNodeSettings = {
    users?: string[];
    publicLink?: 'remove';
};
