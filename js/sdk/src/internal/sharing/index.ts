import { ProtonDriveAccount, ShareNodeSettings, ShareRole, ShareResult, UnshareNodeSettings } from "../../interface/index.js";
import { DriveCrypto } from '../../crypto/index.js';
import { DriveAPIService } from "../apiService/index.js";
import { sharingAPIService } from "./apiService.js";
import { sharingCryptoService } from "./cryptoService.js";
import { sharingAccess } from "./sharingAccess.js";
import { sharingManagement } from "./sharingManagement.js";
import { NodesService } from "./interface.js";

export function sharing(
    apiService: DriveAPIService,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
    nodesService: NodesService,
) {
    const api = sharingAPIService(apiService);
    const cryptoService = sharingCryptoService(crypto, account);
    const sharingAccessFunctions = sharingAccess(api, cryptoService, nodesService);
    const sharingManagementFunctions = sharingManagement(api, cryptoService, account);

    // TODO: facade to convert high-level interface with object to low-level calls
    async function shareNode(nodeUid: string, settings: ShareNodeSettings) {
        let currentSharing = await sharingManagementFunctions.getSharingInfo(nodeUid);
        if (!currentSharing) {
            currentSharing = await sharingManagementFunctions.createShare(nodeUid);
        }

        for (const user of settings.protonUsers || []) {
            const { email, role } = typeof user === "string" ? { email: user, role: ShareRole.VIEW } : user;
            if (currentSharing.protonInitations[email]) {
                if (currentSharing.protonInitations[email].role === role) {
                    continue;
                }
                sharingManagementFunctions.updateInvitationPermissions(currentSharing.shareId, currentSharing.protonUsers[email].invitationId, role);
                continue;
            }
            sharingManagementFunctions.inviteProtonUser(currentSharing.shareId, email, role);
        }
        // TODO: return all the objects
        return {} as ShareResult;
    }

    async function unshareNode(nodeUid: string, settings?: UnshareNodeSettings) {
        const currentSharing = await sharingManagementFunctions.getSharingInfo(nodeUid);
        if (!currentSharing) {
            return;
        }
        if (!settings) {
            return sharingManagementFunctions.deleteShare(currentSharing.shareId);
        }
        if (settings.publicLink === 'remove') {
            await sharingManagementFunctions.removeSharedLink(currentSharing.shareId);
        }
        for (const user of settings.users || []) {
            const invitationId = currentSharing.protonInitations[user]?.invitationId;
            if (invitationId) {
                sharingManagementFunctions.deleteInvitation(currentSharing.shareId, invitationId);
                continue;
            }
            const externalInvitationId = currentSharing.nonProtonInvitations[user]?.invitationId;
            if (externalInvitationId) {
                sharingManagementFunctions.deleteExternalInvitation(currentSharing.shareId, externalInvitationId);
                continue;
            }
            const memberId = currentSharing.members[user]?.memberId;
            if (memberId) {
                sharingManagementFunctions.removeMember(currentSharing.shareId, memberId);
                continue;
            }
        }
        // TODO: return all the objects
        return {} as ShareResult;
    }

    return {
        ...sharingAccessFunctions,
        shareNode,
        unshareNode,
    }
}
