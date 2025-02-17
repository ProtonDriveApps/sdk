import { ProtonDriveAccount, ShareRole } from "../../interface";
import { SharingAPIService } from "./apiService";
import { SharingCryptoService } from "./cryptoService";

export class SharingManagement {
    constructor(
        private apiService: SharingAPIService,
        private cryptoService: SharingCryptoService,
        private account: ProtonDriveAccount,
    ) {
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.account = account;
    }

    async createShare(nodeUid: string): Promise<any> {}
    async deleteShare(shareId: string): Promise<void> {}
    async getSharingInfo(shareId: string): Promise<any> {}

    // Direct invitations
    async inviteProtonUser(shareId: string, email: string, role: ShareRole): Promise<any> {
        const invitation = await this.cryptoService.encryptInvitation(email);
        await this.apiService.inviteProtonUser({ invitation });
    }
    async updateInvitationPermissions(shareId: string, invitationId: string, role: ShareRole): Promise<void> {}
    async resendInvitationEmail(shareId: string, invitationId: string): Promise<void> {}
    async deleteInvitation(shareId: string, invitationId: string): Promise<void> {}

    // Direct external invitations
    async inviteExternalUser(shareId: string, email: string, role: ShareRole): Promise<any> {}
    async updateExternalInvitationPermissions(shareId: string, invitationId: string, role: ShareRole): Promise<void> {}
    async resendExternalInvitationEmail(shareId: string, invitationId: string): Promise<void> {}
    async deleteExternalInvitation(shareId: string, invitationId: string): Promise<void> {}

    async convertExternalInvitationsToInternal(): Promise<void> {}

    // Direct members
    async removeMember(shareId: string, memberId: string): Promise<void> {}
    async updateMemberPermissions(shareId: string, memberId: string): Promise<void> {}

    // For URL
    async shareViaLink(nodeUid: string): Promise<any> {}
    async updateSharedLink(nodeUid: string, options: any): Promise<any> {}
    async getPublicLink(nodeUid: string): Promise<any> {}
    async removeSharedLink(nodeUid: string): Promise<void> {}
}
