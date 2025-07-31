import { SRPVerifier } from '../../crypto';
import { NodeType, MemberRole, NonProtonInvitationState, Logger } from '../../interface';
import {
    DriveAPIService,
    drivePaths,
    nodeTypeNumberToNodeType,
    permissionsToDirectMemberRole,
    memberRoleToPermission,
} from '../apiService';
import {
    makeNodeUid,
    splitNodeUid,
    makeInvitationUid,
    splitInvitationUid,
    makeMemberUid,
    splitMemberUid,
    makePublicLinkUid,
    splitPublicLinkUid,
} from '../uids';
import {
    EncryptedInvitationRequest,
    EncryptedInvitation,
    EncryptedInvitationWithNode,
    EncryptedExternalInvitation,
    EncryptedMember,
    EncryptedBookmark,
    EncryptedExternalInvitationRequest,
    EncryptedPublicLink,
    EncryptedPublicLinkCrypto,
} from './interface';

type GetSharedNodesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/shares']['get']['responses']['200']['content']['application/json'];

type GetSharedWithMeNodesResponse =
    drivePaths['/drive/v2/sharedwithme']['get']['responses']['200']['content']['application/json'];

type GetInvitationsResponse =
    drivePaths['/drive/v2/shares/invitations']['get']['responses']['200']['content']['application/json'];

type GetInvitationDetailsResponse =
    drivePaths['/drive/v2/shares/invitations/{invitationID}']['get']['responses']['200']['content']['application/json'];

type PostAcceptInvitationRequest = Extract<
    drivePaths['/drive/v2/shares/invitations/{invitationID}/accept']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostAcceptInvitationResponse =
    drivePaths['/drive/v2/shares/invitations/{invitationID}/accept']['post']['responses']['200']['content']['application/json'];

type GetSharedBookmarksResponse =
    drivePaths['/drive/v2/shared-bookmarks']['get']['responses']['200']['content']['application/json'];

type GetShareInvitations =
    drivePaths['/drive/v2/shares/{shareID}/invitations']['get']['responses']['200']['content']['application/json'];

type GetShareExternalInvitations =
    drivePaths['/drive/v2/shares/{shareID}/external-invitations']['get']['responses']['200']['content']['application/json'];

type GetShareMembers =
    drivePaths['/drive/v2/shares/{shareID}/members']['get']['responses']['200']['content']['application/json'];

type PostCreateShareRequest = Extract<
    drivePaths['/drive/volumes/{volumeID}/shares']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCreateShareResponse =
    drivePaths['/drive/volumes/{volumeID}/shares']['post']['responses']['200']['content']['application/json'];

type PostInviteProtonUserRequest = Extract<
    drivePaths['/drive/v2/shares/{shareID}/invitations']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostInviteProtonUserResponse =
    drivePaths['/drive/v2/shares/{shareID}/invitations']['post']['responses']['200']['content']['application/json'];

type PutUpdateInvitationRequest = Extract<
    drivePaths['/drive/v2/shares/{shareID}/invitations/{invitationID}']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PutUpdateInvitationResponse =
    drivePaths['/drive/v2/shares/{shareID}/invitations/{invitationID}']['put']['responses']['200']['content']['application/json'];

type PostInviteExternalUserRequest = Extract<
    drivePaths['/drive/v2/shares/{shareID}/external-invitations']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostInviteExternalUserResponse =
    drivePaths['/drive/v2/shares/{shareID}/external-invitations']['post']['responses']['200']['content']['application/json'];

type PutUpdateExternalInvitationRequest = Extract<
    drivePaths['/drive/v2/shares/{shareID}/external-invitations/{invitationID}']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PutUpdateExternalInvitationResponse =
    drivePaths['/drive/v2/shares/{shareID}/external-invitations/{invitationID}']['put']['responses']['200']['content']['application/json'];

type PostUpdateMemberRequest = Extract<
    drivePaths['/drive/v2/shares/{shareID}/members/{memberID}']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostUpdateMemberResponse =
    drivePaths['/drive/v2/shares/{shareID}/members/{memberID}']['put']['responses']['200']['content']['application/json'];

type GetShareUrlsResponse =
    drivePaths['/drive/shares/{shareID}/urls']['get']['responses']['200']['content']['application/json'];

type PostShareUrlRequest = Extract<
    drivePaths['/drive/shares/{shareID}/urls']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostShareUrlResponse =
    drivePaths['/drive/shares/{shareID}/urls']['post']['responses']['200']['content']['application/json'];

type PutShareUrlRequest = Extract<
    drivePaths['/drive/shares/{shareID}/urls/{urlID}']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PutShareUrlResponse =
    drivePaths['/drive/shares/{shareID}/urls/{urlID}']['put']['responses']['200']['content']['application/json'];

// We do not support photos and albums yet.
const SUPPORTED_SHARE_TARGET_TYPES = [
    0, // Root
    1, // Folder
    2, // File
    5, // Proton vendor (documents and sheets)
];

/**
 * Provides API communication for fetching and managing sharing.
 *
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class SharingAPIService {
    constructor(
        private logger: Logger,
        private apiService: DriveAPIService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
    }

    async *iterateSharedNodeUids(volumeId: string, signal?: AbortSignal): AsyncGenerator<string> {
        let anchor = '';
        while (true) {
            const response = await this.apiService.get<GetSharedNodesResponse>(
                `drive/v2/volumes/${volumeId}/shares?${anchor ? `AnchorID=${anchor}` : ''}`,
                signal,
            );
            for (const link of response.Links) {
                yield makeNodeUid(volumeId, link.LinkID);
            }

            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async *iterateSharedWithMeNodeUids(signal?: AbortSignal): AsyncGenerator<string> {
        let anchor = '';
        while (true) {
            const response = await this.apiService.get<GetSharedWithMeNodesResponse>(
                `drive/v2/sharedwithme?${anchor ? `AnchorID=${anchor}` : ''}`,
                signal,
            );
            for (const link of response.Links) {
                const nodeUid = makeNodeUid(link.VolumeID, link.LinkID);

                if (!SUPPORTED_SHARE_TARGET_TYPES.includes(link.ShareTargetType)) {
                    this.logger.warn(`Unsupported share target type ${link.ShareTargetType} for node ${nodeUid}`);
                    continue;
                }

                yield nodeUid;
            }

            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async *iterateInvitationUids(signal?: AbortSignal): AsyncGenerator<string> {
        let anchor = '';
        while (true) {
            const response = await this.apiService.get<GetInvitationsResponse>(
                `drive/v2/shares/invitations?${anchor ? `AnchorID=${anchor}` : ''}`,
                signal,
            );
            for (const invitation of response.Invitations) {
                const invitationUid = makeInvitationUid(invitation.ShareID, invitation.InvitationID);

                if (!SUPPORTED_SHARE_TARGET_TYPES.includes(invitation.ShareTargetType)) {
                    this.logger.warn(
                        `Unsupported share target type ${invitation.ShareTargetType} for invitation ${invitationUid}`,
                    );
                    continue;
                }

                yield invitationUid;
            }

            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async getInvitation(invitationUid: string): Promise<EncryptedInvitationWithNode> {
        const { invitationId } = splitInvitationUid(invitationUid);
        const response = await this.apiService.get<GetInvitationDetailsResponse>(
            `drive/v2/shares/invitations/${invitationId}`,
        );
        return {
            uid: invitationUid,
            addedByEmail: response.Invitation.InviterEmail,
            inviteeEmail: response.Invitation.InviteeEmail,
            base64KeyPacket: response.Invitation.KeyPacket,
            base64KeyPacketSignature: response.Invitation.KeyPacketSignature,
            invitationTime: new Date(response.Invitation.CreateTime * 1000),
            role: permissionsToDirectMemberRole(this.logger, response.Invitation.Permissions),
            share: {
                armoredKey: response.Share.ShareKey,
                armoredPassphrase: response.Share.Passphrase,
                creatorEmail: response.Share.CreatorEmail,
            },
            node: {
                uid: makeNodeUid(response.Share.VolumeID, response.Link.LinkID),
                type: nodeTypeNumberToNodeType(this.logger, response.Link.Type),
                mediaType: response.Link.MIMEType || undefined,
                encryptedName: response.Link.Name,
            },
        };
    }

    async acceptInvitation(invitationUid: string, base64SessionKeySignature: string): Promise<void> {
        const { invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.post<PostAcceptInvitationRequest, PostAcceptInvitationResponse>(
            `drive/v2/shares/invitations/${invitationId}/accept`,
            {
                SessionKeySignature: base64SessionKeySignature,
            },
        );
    }

    async rejectInvitation(invitationUid: string): Promise<void> {
        const { invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.post(`drive/v2/shares/invitations/${invitationId}/reject`);
    }

    async *iterateBookmarks(signal?: AbortSignal): AsyncGenerator<EncryptedBookmark> {
        const response = await this.apiService.get<GetSharedBookmarksResponse>(`drive/v2/shared-bookmarks`, signal);
        for (const bookmark of response.Bookmarks) {
            yield {
                tokenId: bookmark.Token.Token,
                creationTime: new Date(bookmark.CreateTime * 1000),
                share: {
                    armoredKey: bookmark.Token.ShareKey,
                    armoredPassphrase: bookmark.Token.SharePassphrase,
                },
                url: {
                    encryptedUrlPassword: bookmark.EncryptedUrlPassword || undefined,
                    base64SharePasswordSalt: bookmark.Token.SharePasswordSalt,
                },
                node: {
                    type: bookmark.Token.LinkType === 1 ? NodeType.Folder : NodeType.File,
                    mediaType: bookmark.Token.MIMEType,
                    encryptedName: bookmark.Token.Name,
                    armoredKey: bookmark.Token.NodeKey,
                    armoredNodePassphrase: bookmark.Token.NodePassphrase,
                    file: {
                        base64ContentKeyPacket: bookmark.Token.ContentKeyPacket || undefined,
                    },
                },
            };
        }
    }

    async deleteBookmark(tokenId: string): Promise<void> {
        await this.apiService.delete(`drive/v2/urls/${tokenId}/bookmark`);
    }

    async getShareInvitations(shareId: string): Promise<EncryptedInvitation[]> {
        const response = await this.apiService.get<GetShareInvitations>(`drive/v2/shares/${shareId}/invitations`);
        return response.Invitations.map((invitation) => {
            return this.convertInternalInvitation(shareId, invitation);
        });
    }

    async getShareExternalInvitations(shareId: string): Promise<EncryptedExternalInvitation[]> {
        const response = await this.apiService.get<GetShareExternalInvitations>(
            `drive/v2/shares/${shareId}/external-invitations`,
        );
        return response.ExternalInvitations.map((invitation) => {
            return this.convertExternalInvitaiton(shareId, invitation);
        });
    }

    async getShareMembers(shareId: string): Promise<EncryptedMember[]> {
        const response = await this.apiService.get<GetShareMembers>(`drive/v2/shares/${shareId}/members`);
        return response.Members.map((member) => {
            return {
                uid: makeMemberUid(shareId, member.MemberID),
                addedByEmail: member.InviterEmail,
                inviteeEmail: member.Email,
                base64KeyPacket: member.KeyPacket,
                base64KeyPacketSignature: member.KeyPacketSignature,
                invitationTime: new Date(member.CreateTime * 1000),
                role: permissionsToDirectMemberRole(this.logger, member.Permissions),
            };
        });
    }

    async createStandardShare(
        nodeUid: string,
        addressId: string,
        shareKey: {
            armoredKey: string;
            armoredPassphrase: string;
            armoredPassphraseSignature: string;
        },
        node: {
            base64PassphraseKeyPacket: string;
            base64NameKeyPacket: string;
        },
    ): Promise<string> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const response = await this.apiService.post<PostCreateShareRequest, PostCreateShareResponse>(
            `drive/volumes/${volumeId}/shares`,
            {
                RootLinkID: nodeId,
                AddressID: addressId,
                Name: 'New Share',
                ShareKey: shareKey.armoredKey,
                SharePassphrase: shareKey.armoredPassphrase,
                SharePassphraseSignature: shareKey.armoredPassphraseSignature,
                PassphraseKeyPacket: node.base64PassphraseKeyPacket,
                NameKeyPacket: node.base64NameKeyPacket,
            },
        );
        return response.Share.ID;
    }

    async deleteShare(shareId: string): Promise<void> {
        await this.apiService.delete(`drive/shares/${shareId}?Force=1`);
    }

    async inviteProtonUser(
        shareId: string,
        invitation: EncryptedInvitationRequest,
        emailDetails: { message?: string; nodeName?: string } = {},
    ): Promise<EncryptedInvitation> {
        const response = await this.apiService.post<PostInviteProtonUserRequest, PostInviteProtonUserResponse>(
            `drive/v2/shares/${shareId}/invitations`,
            {
                Invitation: {
                    InviterEmail: invitation.addedByEmail,
                    InviteeEmail: invitation.inviteeEmail,
                    Permissions: memberRoleToPermission(invitation.role),
                    KeyPacket: invitation.base64KeyPacket,
                    KeyPacketSignature: invitation.base64KeyPacketSignature,
                    ExternalInvitationID: null,
                },
                EmailDetails: {
                    Message: emailDetails.message,
                    ItemName: emailDetails.nodeName,
                },
            },
        );
        return this.convertInternalInvitation(shareId, response.Invitation);
    }

    async updateInvitation(invitationUid: string, invitation: { role: MemberRole }): Promise<void> {
        const { shareId, invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.put<PutUpdateInvitationRequest, PutUpdateInvitationResponse>(
            `drive/v2/shares/${shareId}/invitations/${invitationId}`,
            {
                Permissions: memberRoleToPermission(invitation.role),
            },
        );
    }

    async resendInvitationEmail(invitationUid: string): Promise<void> {
        const { shareId, invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.post(`drive/v2/shares/${shareId}/invitations/${invitationId}/sendemail`);
    }

    async deleteInvitation(invitationUid: string): Promise<void> {
        const { shareId, invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.delete(`drive/v2/shares/${shareId}/invitations/${invitationId}`);
    }

    async inviteExternalUser(
        shareId: string,
        invitation: EncryptedExternalInvitationRequest,
        emailDetails: { message?: string; nodeName?: string } = {},
    ): Promise<EncryptedExternalInvitation> {
        const response = await this.apiService.post<PostInviteExternalUserRequest, PostInviteExternalUserResponse>(
            `drive/v2/shares/${shareId}/external-invitations`,
            {
                ExternalInvitation: {
                    InviterAddressID: invitation.inviterAddressId,
                    InviteeEmail: invitation.inviteeEmail,
                    Permissions: memberRoleToPermission(invitation.role),
                    ExternalInvitationSignature: invitation.base64Signature,
                },
                EmailDetails: {
                    Message: emailDetails.message,
                    ItemName: emailDetails.nodeName,
                },
            },
        );
        return this.convertExternalInvitaiton(shareId, response.ExternalInvitation);
    }

    async updateExternalInvitation(invitationUid: string, invitation: { role: MemberRole }): Promise<void> {
        const { shareId, invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.put<PutUpdateExternalInvitationRequest, PutUpdateExternalInvitationResponse>(
            `drive/v2/shares/${shareId}/external-invitations/${invitationId}`,
            {
                Permissions: memberRoleToPermission(invitation.role),
            },
        );
    }

    async resendExternalInvitationEmail(invitationUid: string): Promise<void> {
        const { shareId, invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.post(`drive/v2/shares/${shareId}/external-invitations/${invitationId}/sendemail`);
    }

    async deleteExternalInvitation(invitationUid: string): Promise<void> {
        const { shareId, invitationId } = splitInvitationUid(invitationUid);
        await this.apiService.delete(`drive/v2/shares/${shareId}/external-invitations/${invitationId}`);
    }

    async updateMember(memberUid: string, member: { role: MemberRole }): Promise<void> {
        const { shareId, memberId } = splitMemberUid(memberUid);
        await this.apiService.put<PostUpdateMemberRequest, PostUpdateMemberResponse>(
            `drive/v2/shares/${shareId}/members/${memberId}`,
            {
                Permissions: memberRoleToPermission(member.role),
            },
        );
    }

    async removeMember(memberUid: string): Promise<void> {
        const { shareId, memberId } = splitMemberUid(memberUid);
        await this.apiService.delete(`drive/v2/shares/${shareId}/members/${memberId}`);
    }

    async getPublicLink(shareId: string): Promise<EncryptedPublicLink | undefined> {
        const response = await this.apiService.get<GetShareUrlsResponse>(`drive/shares/${shareId}/urls`);

        if (!response.ShareURLs || response.ShareURLs.length === 0) {
            return undefined;
        }
        if (response.ShareURLs.length > 1) {
            this.logger.warn('Multiple share URLs found, using the first one');
        }
        const shareUrl = response.ShareURLs[0];

        return {
            uid: makePublicLinkUid(shareUrl.ShareID, shareUrl.ShareURLID),
            creationTime: new Date(shareUrl.CreateTime * 1000),
            expirationTime: shareUrl.ExpirationTime ? new Date(shareUrl.ExpirationTime * 1000) : undefined,
            role: permissionsToDirectMemberRole(this.logger, shareUrl.Permissions),
            flags: shareUrl.Flags,
            creatorEmail: shareUrl.CreatorEmail,
            publicUrl: shareUrl.PublicUrl,
            numberOfInitializedDownloads: shareUrl.NumAccesses,
            armoredUrlPassword: shareUrl.Password,
            urlPasswordSalt: shareUrl.UrlPasswordSalt,
            base64SharePassphraseKeyPacket: shareUrl.SharePassphraseKeyPacket,
            sharePassphraseSalt: shareUrl.SharePasswordSalt,
        };
    }

    async createPublicLink(
        shareId: string,
        publicLink: {
            creatorEmail: string;
            role: MemberRole;
            includesCustomPassword: boolean;
            expirationTime?: number;
            crypto: EncryptedPublicLinkCrypto;
            srp: SRPVerifier;
        },
    ): Promise<{
        uid: string;
        publicUrl: string;
    }> {
        if (publicLink.role === MemberRole.Admin) {
            throw new Error('Cannot set admin role for public link.');
        }

        const result = await this.apiService.post<
            // TODO: Backend type wrongly requires ExpirationDuration (it should be optional) and Name (it is not used).
            Omit<PostShareUrlRequest, 'ExpirationDuration' | 'Name'>,
            PostShareUrlResponse
        >(`drive/shares/${shareId}/urls`, {
            CreatorEmail: publicLink.creatorEmail,
            ...this.generatePublicLinkRequestPayload(publicLink),
        });
        return {
            uid: makePublicLinkUid(shareId, result.ShareURL.ShareURLID),
            publicUrl: result.ShareURL.PublicUrl,
        };
    }

    async updatePublicLink(
        publicLinkUid: string,
        publicLink: {
            role: MemberRole;
            includesCustomPassword: boolean;
            expirationTime?: number;
            crypto: EncryptedPublicLinkCrypto;
            srp: SRPVerifier;
        },
    ): Promise<void> {
        if (publicLink.role === MemberRole.Admin) {
            throw new Error('Cannot set admin role for public link.');
        }

        const { shareId, publicLinkId } = splitPublicLinkUid(publicLinkUid);

        await this.apiService.put<
            // TODO: Backend type wrongly requires ExpirationTime (it should be optional) and Name (it is not used).
            Omit<PutShareUrlRequest, 'ExpirationTime' | 'Name'> & { ExpirationTime: number | null },
            PutShareUrlResponse
        >(`drive/shares/${shareId}/urls/${publicLinkId}`, this.generatePublicLinkRequestPayload(publicLink));
    }

    private generatePublicLinkRequestPayload(publicLink: {
        role: MemberRole;
        includesCustomPassword: boolean;
        expirationTime?: number;
        crypto: EncryptedPublicLinkCrypto;
        srp: SRPVerifier;
    }): Pick<
        PostShareUrlRequest,
        | 'Permissions'
        | 'Flags'
        | 'ExpirationTime'
        | 'SharePasswordSalt'
        | 'SharePassphraseKeyPacket'
        | 'Password'
        | 'UrlPasswordSalt'
        | 'SRPVerifier'
        | 'SRPModulusID'
        | 'MaxAccesses'
    > {
        return {
            Permissions: memberRoleToPermission(publicLink.role) as 4 | 6,
            Flags: publicLink.includesCustomPassword
                ? 3 // Random + custom password set.
                : 2, // Random password set.
            ExpirationTime: publicLink.expirationTime || null,

            SharePasswordSalt: publicLink.crypto.base64SharePasswordSalt,
            SharePassphraseKeyPacket: publicLink.crypto.base64SharePassphraseKeyPacket,
            Password: publicLink.crypto.armoredPassword,

            UrlPasswordSalt: publicLink.srp.salt,
            SRPVerifier: publicLink.srp.verifier,
            SRPModulusID: publicLink.srp.modulusId,

            MaxAccesses: 0, // We don't support setting limit.
        };
    }

    async removePublicLink(publicLinkUid: string): Promise<void> {
        const { shareId, publicLinkId } = splitPublicLinkUid(publicLinkUid);
        await this.apiService.delete(`drive/shares/${shareId}/urls/${publicLinkId}`);
    }

    private convertInternalInvitation(
        shareId: string,
        invitation: GetShareInvitations['Invitations'][0],
    ): EncryptedInvitation {
        return {
            uid: makeInvitationUid(shareId, invitation.InvitationID),
            addedByEmail: invitation.InviterEmail,
            inviteeEmail: invitation.InviteeEmail,
            invitationTime: new Date(invitation.CreateTime * 1000),
            role: permissionsToDirectMemberRole(this.logger, invitation.Permissions),
            base64KeyPacket: invitation.KeyPacket,
            base64KeyPacketSignature: invitation.KeyPacketSignature,
        };
    }

    private convertExternalInvitaiton(
        shareId: string,
        invitation: GetShareExternalInvitations['ExternalInvitations'][0],
    ): EncryptedExternalInvitation {
        const state =
            invitation.State === 1 ? NonProtonInvitationState.Pending : NonProtonInvitationState.UserRegistered;
        return {
            uid: makeInvitationUid(shareId, invitation.ExternalInvitationID),
            addedByEmail: invitation.InviterEmail,
            inviteeEmail: invitation.InviteeEmail,
            invitationTime: new Date(invitation.CreateTime * 1000),
            role: permissionsToDirectMemberRole(this.logger, invitation.Permissions),
            base64Signature: invitation.ExternalInvitationSignature,
            state,
        };
    }
}
