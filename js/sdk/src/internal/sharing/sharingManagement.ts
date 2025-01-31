import { ProtonDriveAccount, ShareRole } from "../../interface/index.js";
import { sharingAPIService } from "./apiService.js";
import { sharingCryptoService } from "./cryptoService.js";

export function sharingManagement(
    apiService: ReturnType<typeof sharingAPIService>,
    cryptoService: ReturnType<typeof sharingCryptoService>,
    account: ProtonDriveAccount,
) {
    async function createShare(nodeUid: string): Promise<any> {}
    async function deleteShare(shareId: string): Promise<void> {}
    async function getSharingInfo(shareId: string): Promise<any> {}

    // Direct invitations
    async function inviteProtonUser(shareId: string, email: string, role: ShareRole): Promise<any> {
        const invitation = await cryptoService.encryptInvitation(email);
        await apiService.inviteProtonUser({ invitation });
    }
    async function updateInvitationPermissions(shareId: string, invitationId: string, role: ShareRole): Promise<void> {}
    async function resendInvitationEmail(shareId: string, invitationId: string): Promise<void> {}
    async function deleteInvitation(shareId: string, invitationId: string): Promise<void> {}
    
    // Direct external invitations
    async function inviteExternalUser(shareId: string, email: string, role: ShareRole): Promise<any> {}
    async function updateExternalInvitationPermissions(shareId: string, invitationId: string, role: ShareRole): Promise<void> {}
    async function resendExternalInvitationEmail(shareId: string, invitationId: string): Promise<void> {}
    async function deleteExternalInvitation(shareId: string, invitationId: string): Promise<void> {}

    async function convertExternalInvitationsToInternal(): Promise<void> {}

    // Direct members
    async function removeMember(shareId: string, memberId: string): Promise<void> {}
    async function updateMemberPermissions(shareId: string, memberId: string): Promise<void> {}

    // For URL
    async function shareViaLink(nodeUid: string): Promise<any> {}
    async function updateSharedLink(nodeUid: string, options: any): Promise<any> {}
    async function getPublicLink(nodeUid: string): Promise<any> {}
    async function removeSharedLink(nodeUid: string): Promise<void> {}

    return {
        createShare,
        deleteShare,
        getSharingInfo,
        inviteProtonUser,
        updateInvitationPermissions,
        resendInvitationEmail,
        deleteInvitation,
        inviteExternalUser,
        updateExternalInvitationPermissions,
        resendExternalInvitationEmail,
        deleteExternalInvitation,
        convertExternalInvitationsToInternal,
        removeMember,
        updateMemberPermissions,
        shareViaLink,
        updateSharedLink,
        getPublicLink,
        removeSharedLink,
    }
}
