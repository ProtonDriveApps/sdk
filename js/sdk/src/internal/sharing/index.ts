import { ProtonDriveAccount, ShareNodeSettings, ShareRole, ShareResult, UnshareNodeSettings, ProtonDriveEntitiesCache, Logger } from "../../interface";
import { DriveCrypto } from '../../crypto';
import { DriveAPIService } from "../apiService";
import { DriveEventsService } from "../events";
import { SharingAPIService } from "./apiService";
import { SharingCache } from "./cache";
import { SharingCryptoService } from "./cryptoService";
import { SharingEvents } from "./events";
import { SharingAccess } from "./sharingAccess";
import { SharingManagement } from "./sharingManagement";
import { SharesService, NodesService } from "./interface";

export function initSharingModule(
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
    driveEvents: DriveEventsService,
    sharesService: SharesService,
    nodesService: NodesService,
    log?: Logger,
) {
    const api = new SharingAPIService(apiService);
    const cache = new SharingCache(driveEntitiesCache);
    const cryptoService = new SharingCryptoService(crypto, account);
    const sharingAccess = new SharingAccess(api, cache, sharesService, nodesService);
    const sharingEvents = new SharingEvents(driveEvents, cache, nodesService, sharingAccess, log);
    const sharingManagement = new SharingManagement(api, cryptoService, account);

    // TODO: facade to convert high-level interface with object to low-level calls
    async function shareNode(nodeUid: string, settings: ShareNodeSettings) {
        let currentSharing = await sharingManagement.getSharingInfo(nodeUid);
        if (!currentSharing) {
            currentSharing = await sharingManagement.createShare(nodeUid);
        }

        for (const user of settings.protonUsers || []) {
            const { email, role } = typeof user === "string" ? { email: user, role: ShareRole.VIEW } : user;
            if (currentSharing.protonInitations[email]) {
                if (currentSharing.protonInitations[email].role === role) {
                    continue;
                }
                sharingManagement.updateInvitationPermissions(currentSharing.shareId, currentSharing.protonUsers[email].invitationId, role);
                continue;
            }
            sharingManagement.inviteProtonUser(currentSharing.shareId, email, role);
        }
        // TODO: return all the objects
        return {} as ShareResult;
    }

    async function unshareNode(nodeUid: string, settings?: UnshareNodeSettings) {
        const currentSharing = await sharingManagement.getSharingInfo(nodeUid);
        if (!currentSharing) {
            return;
        }
        if (!settings) {
            return sharingManagement.deleteShare(currentSharing.shareId);
        }
        if (settings.publicLink === 'remove') {
            await sharingManagement.removeSharedLink(currentSharing.shareId);
        }
        for (const user of settings.users || []) {
            const invitationId = currentSharing.protonInitations[user]?.invitationId;
            if (invitationId) {
                sharingManagement.deleteInvitation(currentSharing.shareId, invitationId);
                continue;
            }
            const externalInvitationId = currentSharing.nonProtonInvitations[user]?.invitationId;
            if (externalInvitationId) {
                sharingManagement.deleteExternalInvitation(currentSharing.shareId, externalInvitationId);
                continue;
            }
            const memberId = currentSharing.members[user]?.memberId;
            if (memberId) {
                sharingManagement.removeMember(currentSharing.shareId, memberId);
                continue;
            }
        }
        // TODO: return all the objects
        return {} as ShareResult;
    }

    return {
        access: sharingAccess,
        events: sharingEvents,
        shareNode,
        unshareNode,
    };
}
