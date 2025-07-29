import { c } from 'ttag';

import { SessionKey } from "../../crypto";
import { ValidationError } from "../../errors";
import { Logger, MemberRole, ShareNodeSettings, UnshareNodeSettings, ShareResult, ProtonInvitation, NonProtonInvitation, Member, resultOk, ProtonDriveAccount, SharePublicLinkSettingsObject } from "../../interface";
import { splitNodeUid } from "../uids";
import { getErrorMessage } from '../errors';
import { SharingAPIService } from "./apiService";
import { PUBLIC_LINK_GENERATED_PASSWORD_LENGTH, SharingCryptoService } from "./cryptoService";
import { SharesService, NodesService, ShareResultWithCreatorEmail, PublicLinkWithCreatorEmail } from "./interface";

interface InternalShareResult extends ShareResultWithCreatorEmail {
    share: Share;
    nodeName: string;
}

interface Share {
    volumeId: string;
    shareId: string;
    creatorEmail: string;
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
        private account: ProtonDriveAccount,
        private sharesService: SharesService,
        private nodesService: NodesService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.account = account;
        this.sharesService = sharesService;
        this.nodesService = nodesService;
    }

    async getSharingInfo(nodeUid: string): Promise<ShareResultWithCreatorEmail | undefined> {
        const node = await this.nodesService.getNode(nodeUid);
        if (!node.shareId) {
            return;
        }

        const [protonInvitations, nonProtonInvitations, members, publicLink] = await Promise.all([
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

    private async getPublicLink(shareId: string): Promise<PublicLinkWithCreatorEmail | undefined> {
        const encryptedPublicLink = await this.apiService.getPublicLink(shareId);
        if (!encryptedPublicLink) {
            return;
        }
        return this.cryptoService.decryptPublicLink(encryptedPublicLink);
    }

    async shareNode(nodeUid: string, settings: ShareNodeSettings): Promise<ShareResult> {
        // Check what users are Proton users before creating share
        // so if this fails, we don't create empty share.
        const protonUsers = [];
        const nonProtonUsers = [];
        if (settings.users) {
            for (const user of settings.users) {
                const { email, role } = typeof user === "string"
                    ? { email: user, role: MemberRole.Viewer }
                    : user;
                const isProtonUser = await this.account.hasProtonAccount(email);
                if (isProtonUser) {
                    protonUsers.push({ email, role });
                } else {
                    nonProtonUsers.push({ email, role });
                }
            }
        }

        // Check if expiration date is in the past before creating share
        // so if this fails, we don't create empty share.
        if (typeof settings.publicLink === 'object' && settings.publicLink.expiration && settings.publicLink.expiration < new Date()) {
            throw new ValidationError(c('Error').t`Expiration date cannot be in the past`);
        }

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

        for (const user of protonUsers) {
            const { email, role } = user;

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

        for (const user of nonProtonUsers) {
            const { email, role } = user;

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
                this.logger.info(`Updating public link with role ${options.role} to node ${nodeUid}`);
                currentSharing.publicLink = await this.updateSharedLink(currentSharing.share, currentSharing.publicLink, options);
            } else {
                this.logger.info(`Sharing via public link with role ${options.role} to node ${nodeUid}`);
                currentSharing.publicLink = await this.shareViaLink(currentSharing.share, options);
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
            await this.deleteShare(currentSharing.share.shareId, nodeUid);
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
            if (currentSharing.publicLink) {
                this.logger.info(`Removing public link to node ${nodeUid}`);
                await this.removeSharedLink(currentSharing.publicLink.uid);
            } else {
                this.logger.info(`Public link not found for node ${nodeUid}`);
            }
            currentSharing.publicLink = undefined;
        }

        if (
            currentSharing.protonInvitations.length === 0 &&
            currentSharing.nonProtonInvitations.length === 0 &&
            currentSharing.members.length === 0 &&
            !currentSharing.publicLink
        ) {
            // Technically it is not needed to delete the share explicitly
            // as it will be deleted when the last member is removed by the
            // backend, but that might take a while and it is better to
            // update local state immediately.
            this.logger.info(`Deleting share ${currentSharing.share.shareId} for node ${nodeUid}`);
            try {
                await this.deleteShare(currentSharing.share.shareId, nodeUid);
            } catch (error: unknown) {
                // If deleting the share fails, we don't want to throw an error
                // as it might be a race condition that other client updated
                // the share and it is not empty.
                // If share is truly empty, backend will delete it eventually.
                this.logger.warn(`Failed to delete share ${currentSharing.share.shareId} for node ${nodeUid}: ${getErrorMessage(error)}`);
            }
            return;
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
                creatorEmail: encryptedShare.creatorEmail,
                passphraseSessionKey: passphraseSessionKey,
            },
            nodeName: node.name.ok ? node.name.value : node.name.error.name,
        }
    }

    private async createShare(nodeUid: string): Promise<Share> {
        const node = await this.nodesService.getNode(nodeUid);
        if (!node.parentUid) {
            throw new ValidationError(c('Error').t`Cannot share root folder`);
        }

        const { volumeId } = splitNodeUid(nodeUid);
        const { email, addressId, addressKey } = await this.nodesService.getRootNodeEmailKey(nodeUid);

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
        await this.nodesService.notifyNodeChanged(nodeUid);
        return {
            volumeId,
            shareId,
            creatorEmail: email,
            passphraseSessionKey: keys.shareKey.decrypted.passphraseSessionKey,
        }
    }

    private async deleteShare(shareId: string, nodeUid: string): Promise<void> {
        await this.apiService.deleteShare(shareId);
        await this.nodesService.notifyNodeChanged(nodeUid);
    }

    private async inviteProtonUser(share: Share, inviteeEmail: string, role: MemberRole, emailOptions: EmailOptions): Promise<ProtonInvitation> {
        const inviter = await this.sharesService.getContextShareMemberEmailKey(share.shareId);
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

    async resendInvitationEmail(nodeUid: string, invitationUid: string): Promise<void> {
        const currentSharing = await this.getInternalSharingInfo(nodeUid);

        if (!currentSharing) {
            throw new ValidationError(c('Error').t`Node is not shared`);
        }

        const protonInvite = currentSharing.protonInvitations.find((invitation) => invitation.uid === invitationUid);
        if (protonInvite) {
            return await this.apiService.resendInvitationEmail(protonInvite.uid);
        }

        const nonProtonInvite = currentSharing.nonProtonInvitations.find((invitation) => invitation.uid === invitationUid);
        if (nonProtonInvite) {
            return await this.apiService.resendExternalInvitationEmail(nonProtonInvite.uid);
        }

        throw new ValidationError(c('Error').t`Invitation not found`);
    }

    private async deleteInvitation(invitationUid: string): Promise<void> {
        await this.apiService.deleteInvitation(invitationUid);
    }

    private async inviteExternalUser(share: Share, inviteeEmail: string, role: MemberRole, emailOptions: EmailOptions): Promise<NonProtonInvitation> {
        const inviter = await this.sharesService.getContextShareMemberEmailKey(share.shareId);
        const invitationCrypto = await this.cryptoService.encryptExternalInvitation(share.passphraseSessionKey, inviter.addressKey, inviteeEmail);

        const encryptedInvitation = await this.apiService.inviteExternalUser(share.shareId, {
            inviterAddressId: inviter.addressId,
            inviteeEmail: inviteeEmail,
            role,
            base64Signature: invitationCrypto.base64ExternalInvitationSignature,
        }, emailOptions);

        return {
            uid: encryptedInvitation.uid,
            invitationTime: encryptedInvitation.invitationTime,
            addedByEmail: resultOk(inviter.email),
            inviteeEmail,
            role,
            state: encryptedInvitation.state,
        };
    }

    private async updateExternalInvitation(invitationUid: string, role: MemberRole): Promise<void> {
        await this.apiService.updateExternalInvitation(invitationUid, { role });
    }


    private async deleteExternalInvitation(invitationUid: string): Promise<void> {
        await this.apiService.deleteExternalInvitation(invitationUid);
    }

    private async convertExternalInvitationsToInternal(): Promise<void> {
        // FIXME
    }

    private async removeMember(memberUid: string): Promise<void> {
        await this.apiService.removeMember(memberUid);
    }

    private async updateMember(memberUid: string, role: MemberRole): Promise<void> {
        await this.apiService.updateMember(memberUid, { role });
    }

    private async shareViaLink(share: Share, options: SharePublicLinkSettingsObject): Promise<PublicLinkWithCreatorEmail> {
        const { email: creatorEmail } = await this.sharesService.getContextShareMemberEmailKey(share.shareId);

        const generatedPassword = await this.cryptoService.generatePublicLinkPassword();
        const password = options.customPassword ? `${generatedPassword}${options.customPassword}` : generatedPassword;

        const { crypto, srp } = await this.cryptoService.encryptPublicLink(creatorEmail, share.passphraseSessionKey, password);
        const publicLink = await this.apiService.createPublicLink(share.shareId, {
            creatorEmail,
            role: options.role,
            includesCustomPassword: !!options.customPassword,
            expirationTime: options.expiration ? Math.floor(options.expiration.getTime() / 1000) : undefined,
            crypto,
            srp,
        });

        return {
            uid: publicLink.uid,
            creationTime: new Date(),
            role: options.role,
            url: `${publicLink.publicUrl}#${generatedPassword}`,
            customPassword: options.customPassword,
            expirationTime: options.expiration,
            numberOfInitializedDownloads: 0,
            creatorEmail,
        }
    }

    private async updateSharedLink(share: Share, publicLink: PublicLinkWithCreatorEmail, options: SharePublicLinkSettingsObject): Promise<PublicLinkWithCreatorEmail> {
        const generatedPassword = publicLink.url.split('#')[1];
        // Legacy public links didn't have generated password or had various lengths.
        if (!generatedPassword || generatedPassword.length !== PUBLIC_LINK_GENERATED_PASSWORD_LENGTH) {
            throw new ValidationError(c('Error').t`Legacy public link cannot be updated. Please re-create a new public link.`);
        }
        const password = options.customPassword ? `${generatedPassword}${options.customPassword}` : generatedPassword;

        const { crypto, srp } = await this.cryptoService.encryptPublicLink(publicLink.creatorEmail, share.passphraseSessionKey, password);
        await this.apiService.updatePublicLink(publicLink.uid, {
            role: options.role,
            includesCustomPassword: !!options.customPassword,
            expirationTime: options.expiration ? Math.floor(options.expiration.getTime() / 1000) : undefined,
            crypto,
            srp,
        });

        return {
            ...publicLink,
            role: options.role,
            customPassword: options.customPassword,
            expirationTime: options.expiration,
        }
    }

    private async removeSharedLink(publicLinkUid: string): Promise<void> {
        await this.apiService.removePublicLink(publicLinkUid);
    }
}
