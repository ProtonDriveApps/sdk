import { c } from 'ttag';

import { SessionKey } from "../../crypto";
import { ValidationError } from "../../errors";
import { Logger, PublicLink, MemberRole, ShareNodeSettings, UnshareNodeSettings, SharePublicLinkSettings, ShareResult, ProtonInvitation, NonProtonInvitation, Member, resultOk } from "../../interface";
import { splitNodeUid } from "../uids";
import { SharingAPIService } from "./apiService";
import { SharingCryptoService } from "./cryptoService";
import { SharesService, NodesService } from "./interface";

interface InternalShareResult extends ShareResult {
    share: Share;
    nodeName: string;
}

interface Share {
    volumeId: string;
    shareId: string;
    passphraseSessionKey: SessionKey;
}

interface EmailOptions {
    message?: string;
    nodeName?: string;
}

/**
 * Provides high-level actions for managing sharing.
 *
 * The manager is responsible for sharing and unsharing nodes, and providing
 * sharing details of nodes.
 */
export class SharingManagement {
    constructor(
        private logger: Logger,
        private apiService: SharingAPIService,
        private cryptoService: SharingCryptoService,
        private sharesService: SharesService,
        private nodesService: NodesService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.sharesService = sharesService;
        this.nodesService = nodesService;
    }

    async getSharingInfo(nodeUid: string): Promise<ShareResult | undefined> {
        const node = await this.nodesService.getNode(nodeUid);
        if (!node.shareId) {
            return;
        }

        const [ protonInvitations, nonProtonInvitations, members, publicLink ] = await Promise.all([
            Array.fromAsync(this.iterateShareInvitations(node.shareId)),
            Array.fromAsync(this.iterateShareExternalInvitations(node.shareId)),
            Array.fromAsync(this.iterateShareMembers(node.shareId)),
            this.getPublicLink(node.shareId),
        ]);

        return {
            protonInvitations,
            nonProtonInvitations,
            members,
            publicLink,
        }
    }

    private async* iterateShareInvitations(shareId: string): AsyncGenerator<ProtonInvitation> {
        const invitations = await this.apiService.getShareInvitations(shareId);
        for (const invitation of invitations) {
            yield this.cryptoService.decryptInvitation(invitation);
        }
    }

    private async* iterateShareExternalInvitations(shareId: string): AsyncGenerator<NonProtonInvitation> {
        const invitations = await this.apiService.getShareExternalInvitations(shareId);
        for (const invitation of invitations) {
            yield this.cryptoService.decryptExternalInvitation(invitation);
        }
    }

    private async* iterateShareMembers(shareId: string): AsyncGenerator<Member> {
        const members = await this.apiService.getShareMembers(shareId);
        for (const member of members) {
            yield this.cryptoService.decryptMember(member);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async getPublicLink(shareId: string): Promise<PublicLink | undefined> {
        // TODO
        return undefined;
    }

    async shareNode(nodeUid: string, settings: ShareNodeSettings): Promise<ShareResult> {
        let currentSharing = await this.getInternalSharingInfo(nodeUid);
        if (!currentSharing) {
            const node = await this.nodesService.getNode(nodeUid);
            const share = await this.createShare(nodeUid);
            currentSharing = {
                share,
                nodeName: node.name.ok ? node.name.value : node.name.error.name,
                protonInvitations: [],
                nonProtonInvitations: [],
                members: [],
                publicLink: undefined,
            };
        }

        const emailOptions: EmailOptions = {
            message: settings.emailOptions?.message,
            nodeName: settings.emailOptions?.includeNodeName ? currentSharing.nodeName : undefined,
        }

        for (const user of settings.protonUsers || []) {
            const { email, role } = typeof user === "string"
                ? { email: user, role: MemberRole.Viewer }
                : user;

            const existingInvitation = currentSharing.protonInvitations.find((invitation) => invitation.inviteeEmail === email);
            if (existingInvitation) {
                if (existingInvitation.role === role) {
                    this.logger.info(`Invitation for ${email} already exists with role ${role} to node ${nodeUid}`);
                    continue;
                }
                this.logger.info(`Invitation for ${email} already exists, updating role to ${role} to node ${nodeUid}`);
                await this.updateInvitation(existingInvitation.uid, role);
                existingInvitation.role = role;
                continue;
            }

            const existingMember = currentSharing.members.find((member) => member.inviteeEmail === email);
            if (existingMember) {
                if (existingMember.role === role) {
                    this.logger.info(`Member ${email} already exists with role ${role} to node ${nodeUid}`);
                    continue;
                }
                this.logger.info(`Member ${email} already exists, updating role to ${role} to node ${nodeUid}`);
                await this.updateMember(existingMember.uid, role);
                existingMember.role = role;
                continue;
            }

            this.logger.info(`Inviting user ${email} with role ${role} to node ${nodeUid}`);
            const invitation = await this.inviteProtonUser(currentSharing.share, email, role, emailOptions);
            currentSharing.protonInvitations.push(invitation);
        }

        for (const user of settings.nonProtonUsers || []) {
            const { email, role } = typeof user === "string"
                ? { email: user, role: MemberRole.Viewer }
                : user;

            const existingExternalInvitation = currentSharing.nonProtonInvitations.find((invitation) => invitation.inviteeEmail === email);
            if (existingExternalInvitation) {
                if (existingExternalInvitation.role === role) {
                    this.logger.info(`External invitation for ${email} already exists with role ${role} to node ${nodeUid}`);
                    continue;
                }
                this.logger.info(`External invitation for ${email} already exists, updating role to ${role} to node ${nodeUid}`);
                await this.updateExternalInvitation(existingExternalInvitation.uid, role);
                existingExternalInvitation.role = role;
                continue;
            }

            const existingMember = currentSharing.members.find((member) => member.inviteeEmail === email);
            if (existingMember) {
                if (existingMember.role === role) {
                    this.logger.info(`Member ${email} already exists with role ${role} to node ${nodeUid}`);
                    continue;
                }
                this.logger.info(`Member ${email} already exists, updating role to ${role} to node ${nodeUid}`);
                await this.updateMember(existingMember.uid, role);
                existingMember.role = role;
                continue;
            }

            this.logger.info(`Inviting external user ${email} with role ${role} to node ${nodeUid}`);
            const invitation = await this.inviteExternalUser(currentSharing.share, email, role, emailOptions);
            currentSharing.nonProtonInvitations.push(invitation);
        }

        if (settings.publicLink) {
            const options = settings.publicLink === true
                ? { role: MemberRole.Viewer }
                : settings.publicLink;

            if (currentSharing.publicLink) {
                this.logger.info(`Updating public link with options ${options} to node ${nodeUid}`);
                await this.updateSharedLink(currentSharing.share, options);
            } else {
                this.logger.info(`Sharing via public link with options ${options} to node ${nodeUid}`);
                await this.shareViaLink(currentSharing.share, options);
            }
        }

        return {
            protonInvitations: currentSharing.protonInvitations,
            nonProtonInvitations: currentSharing.nonProtonInvitations,
            members: currentSharing.members,
            publicLink: currentSharing.publicLink,
        };
    }

    async unshareNode(nodeUid: string, settings?: UnshareNodeSettings): Promise<ShareResult | undefined> {
        const currentSharing = await this.getInternalSharingInfo(nodeUid);
        if (!currentSharing) {
            return;
        }

        if (!settings) {
            this.logger.info(`Unsharing node ${nodeUid}`);
            await this.deleteShare(currentSharing.share.shareId);
            return;
        }

        for (const userEmail of settings.users || []) {
            const existingInvitation = currentSharing.protonInvitations.find((invitation) => invitation.inviteeEmail === userEmail);
            if (existingInvitation) {
                this.logger.info(`Deleting invitation for ${userEmail} to node ${nodeUid}`);
                await this.deleteInvitation(existingInvitation.uid);
                currentSharing.protonInvitations = currentSharing.protonInvitations.filter((invitation) => invitation.uid !== existingInvitation.uid);
                continue;
            }

            const existingExternalInvitation = currentSharing.nonProtonInvitations.find((invitation) => invitation.inviteeEmail === userEmail);
            if (existingExternalInvitation) {
                this.logger.info(`Deleting external invitation for ${userEmail} to node ${nodeUid}`);
                await this.deleteExternalInvitation(existingExternalInvitation.uid);
                currentSharing.nonProtonInvitations = currentSharing.nonProtonInvitations.filter((invitation) => invitation.uid !== existingExternalInvitation.uid);
                continue;
            }

            const existingMember = currentSharing.members.find((member) => member.inviteeEmail === userEmail);
            if (existingMember) {
                this.logger.info(`Removing member ${userEmail} to node ${nodeUid}`);
                await this.removeMember(existingMember.uid);
                currentSharing.members = currentSharing.members.filter((member) => member.uid !== existingMember.uid);
                continue;
            }

            this.logger.info(`User ${userEmail} not found in sharing info for node ${nodeUid}`);
        }

        if (settings.publicLink === 'remove') {
            this.logger.info(`Removing public link to node ${nodeUid}`);
            await this.removeSharedLink(currentSharing.share);
            currentSharing.publicLink = undefined;
        }

        return {
            protonInvitations: currentSharing.protonInvitations,
            nonProtonInvitations: currentSharing.nonProtonInvitations,
            members: currentSharing.members,
            publicLink: currentSharing.publicLink,
        };
    }

    private async getInternalSharingInfo(nodeUid: string): Promise<InternalShareResult | undefined> {
        const node = await this.nodesService.getNode(nodeUid);
        if (!node.shareId) {
            return;
        }
        const sharingInfo = await this.getSharingInfo(nodeUid);
        if (!sharingInfo) {
            return;
        }

        const { volumeId } = splitNodeUid(nodeUid);
        const { key: nodeKey } = await this.nodesService.getNodeKeys(nodeUid);
        const encryptedShare = await this.sharesService.loadEncryptedShare(node.shareId);
        const { passphraseSessionKey } = await this.cryptoService.decryptShare(encryptedShare, nodeKey);

        return {
            ...sharingInfo,
            share: {
                volumeId,
                shareId: node.shareId,
                passphraseSessionKey: passphraseSessionKey,
            },
            nodeName: node.name.ok ? node.name.value : node.name.error.name,
        }
    }

    // TODO: update nodes cache with new shareId
    private async createShare(nodeUid: string): Promise<Share> {
        const node = await this.nodesService.getNode(nodeUid);
        if (!node.parentUid) {
            throw new ValidationError(c('Error').t`Cannot share root folder`);
        }

        const { volumeId } = splitNodeUid(nodeUid);
        const { addressId, addressKey } = await this.sharesService.getVolumeEmailKey(volumeId);

        const nodeKeys = await this.nodesService.getNodePrivateAndSessionKeys(nodeUid);
        const keys = await this.cryptoService.generateShareKeys(nodeKeys, addressKey);
        const shareId = await this.apiService.createStandardShare(
            nodeUid,
            addressId,
            keys.shareKey.encrypted,
            {
                base64PassphraseKeyPacket: keys.base64PpassphraseKeyPacket,
                base64NameKeyPacket: keys.base64NameKeyPacket,
            },
        );

        return {
            volumeId,
            shareId,
            passphraseSessionKey: keys.shareKey.decrypted.passphraseSessionKey,
        }
    }

    // TODO: update nodes cache with deleted shareId
    private async deleteShare(shareId: string): Promise<void> {
        await this.apiService.deleteShare(shareId);
    }

    private async inviteProtonUser(share: Share, inviteeEmail: string, role: MemberRole, emailOptions: EmailOptions): Promise<ProtonInvitation> {
        const inviter = await this.sharesService.getVolumeEmailKey(share.volumeId);
        const invitationCrypto = await this.cryptoService.encryptInvitation(share.passphraseSessionKey, inviter.addressKey, inviteeEmail);

        const encryptedInvitation = await this.apiService.inviteProtonUser(share.shareId, {
            addedByEmail: inviter.email,
            inviteeEmail: inviteeEmail,
            role,
            ...invitationCrypto,
        }, emailOptions);

        return {
            ...encryptedInvitation,
            addedByEmail: resultOk(encryptedInvitation.addedByEmail),
        };
    }

    private async updateInvitation(invitationUid: string, role: MemberRole): Promise<void> {
        await this.apiService.updateInvitation(invitationUid, { role });
    }

    async resendInvitationEmail(invitationUid: string): Promise<void> {
        await this.apiService.resendInvitationEmail(invitationUid);
    }

    private async deleteInvitation(invitationUid: string): Promise<void> {
        await this.apiService.deleteInvitation(invitationUid);
    }

    private async inviteExternalUser(share: Share, inviteeEmail: string, role: MemberRole, emailOptions: EmailOptions): Promise<NonProtonInvitation> {
        const inviter = await this.sharesService.getVolumeEmailKey(share.volumeId);
        const invitationCrypto = await this.cryptoService.encryptExternalInvitation(share.passphraseSessionKey, inviter.addressKey, inviteeEmail);

        const encryptedInvitation = await this.apiService.inviteExternalUser(share.shareId, {
            inviterAddressId: inviter.addressId,
            inviteeEmail: inviteeEmail,
            role,
            base64Signature: invitationCrypto.base64ExternalInvitationSignature,
        }, emailOptions);

        return {
            uid: encryptedInvitation.uid,
            invitedDate: encryptedInvitation.invitedDate,
            addedByEmail: resultOk(inviter.email),
            inviteeEmail,
            role,
            state: encryptedInvitation.state,
        };
    }

    private async updateExternalInvitation(invitationUid: string, role: MemberRole): Promise<void> {
        await this.apiService.updateExternalInvitation(invitationUid, { role });
    }

    async resendExternalInvitationEmail(invitationUid: string): Promise<void> {
        await this.apiService.resendExternalInvitationEmail(invitationUid);
    }

    private async deleteExternalInvitation(invitationUid: string): Promise<void> {
        await this.apiService.deleteExternalInvitation(invitationUid);
    }

    private async convertExternalInvitationsToInternal(): Promise<void> {
        // TODO
    }

    private async removeMember(memberUid: string): Promise<void> {
        await this.apiService.removeMember(memberUid);
    }

    private async updateMember(memberUid: string, role: MemberRole): Promise<void> {
        await this.apiService.updateMember(memberUid, { role });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async shareViaLink(share: Share, options: SharePublicLinkSettings): Promise<void> {
        // TODO
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async updateSharedLink(share: Share, options: SharePublicLinkSettings): Promise<void> {
        // TODO
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async removeSharedLink(share: Share): Promise<void> {
        // TODO
    }
}
