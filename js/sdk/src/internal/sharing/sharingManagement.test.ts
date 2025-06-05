import { getMockLogger } from "../../tests/logger";
import { Member, MemberRole, NonProtonInvitation, NonProtonInvitationState, ProtonDriveAccount, ProtonInvitation, PublicLink, resultOk } from "../../interface";
import { SharingAPIService } from "./apiService";
import { SharingCryptoService } from "./cryptoService";
import { SharesService, NodesService, NodesEvents } from "./interface";
import { SharingManagement } from "./sharingManagement";

describe("SharingManagement", () => {
    let apiService: SharingAPIService;
    let cryptoService: SharingCryptoService;
    let accountService: ProtonDriveAccount;
    let sharesService: SharesService;
    let nodesService: NodesService;
    let nodesEvents: NodesEvents;

    let sharingManagement: SharingManagement;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            createStandardShare: jest.fn().mockReturnValue("newShareId"),
            getShareInvitations: jest.fn().mockResolvedValue([]),
            getShareExternalInvitations: jest.fn().mockResolvedValue([]),
            getShareMembers: jest.fn().mockResolvedValue([]),
            inviteProtonUser: jest.fn().mockImplementation((_, invitation) => ({
                ...invitation,
                uid: "created-invitation",
            })),
            updateInvitation: jest.fn(),
            deleteInvitation: jest.fn(),
            inviteExternalUser: jest.fn().mockImplementation((_, invitation) => ({
                ...invitation,
                uid: "created-external-invitation",
                state: NonProtonInvitationState.Pending,
            })),
            updateExternalInvitation: jest.fn(),
            deleteExternalInvitation: jest.fn(),
            updateMember: jest.fn(),
            removeMember: jest.fn(),
            getPublicLink: jest.fn().mockResolvedValue(undefined),
            removePublicLink: jest.fn(),
            deleteShare: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            generateShareKeys: jest.fn().mockResolvedValue({ shareKey: { encrypted: "encrypted-key", decrypted: { passphraseSessionKey: "pass-session-key", } } }),
            decryptShare: jest.fn().mockImplementation((share) => share),
            decryptInvitation: jest.fn().mockImplementation((invitation) => invitation),
            decryptExternalInvitation: jest.fn().mockImplementation((invitation) => invitation),
            decryptMember: jest.fn().mockImplementation((member) => member),
            encryptInvitation: jest.fn().mockImplementation(() => { }),
            encryptExternalInvitation: jest.fn().mockImplementation((invitation) => ({
                ...invitation,
                base64ExternalInvitationSignature: "extenral-signature",
            })),
            decryptPublicLink: jest.fn().mockImplementation((publicLink) => publicLink),
        }
        // @ts-expect-error No need to implement all methods for mocking
        accountService = {
            hasProtonAccount: jest.fn().mockResolvedValue(true),
        }
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            loadEncryptedShare: jest.fn().mockResolvedValue({ id: "shareId", addressId: "addressId" }),
        }
        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {
            getNode: jest.fn().mockImplementation((nodeUid) => ({ nodeUid, shareId: "shareId", name: { ok: true, value: "name" } })),
            getNodeKeys: jest.fn().mockImplementation((nodeUid) => ({ key: "node-key" })),
            getNodePrivateAndSessionKeys: jest.fn().mockImplementation((nodeUid) => ({})),
            getRootNodeEmailKey: jest.fn().mockResolvedValue({ email: "volume-email", addressKey: "volume-key" }),
        }
        nodesEvents = {
            nodeUpdated: jest.fn(),
        }

        sharingManagement = new SharingManagement(getMockLogger(), apiService, cryptoService, accountService, sharesService, nodesService, nodesEvents);
    });

    describe("getSharingInfo", () => {
        it("should return empty sharing info for unshared node", async () => {
            nodesService.getNode = jest.fn().mockResolvedValue({ nodeUid: "nodeUid", shareId: undefined });
            const sharingInfo = await sharingManagement.getSharingInfo("nodeUid");

            expect(sharingInfo).toEqual(undefined);
            expect(apiService.getShareInvitations).not.toHaveBeenCalled();
            expect(apiService.getShareExternalInvitations).not.toHaveBeenCalled();
            expect(apiService.getShareMembers).not.toHaveBeenCalled();
        });

        it("should return invitations", async () => {
            const invitation = { uid: "invitaiton", addedByEmail: "email" };
            apiService.getShareInvitations = jest.fn().mockResolvedValue([
                invitation,
            ]);

            const sharingInfo = await sharingManagement.getSharingInfo("nodeUid");

            expect(sharingInfo).toEqual({
                protonInvitations: [invitation],
                nonProtonInvitations: [],
                members: [],
                publicLink: undefined,
            });
            expect(cryptoService.decryptInvitation).toHaveBeenCalledWith(invitation);
        });

        it("should return external invitations", async () => {
            const externalInvitation = { uid: "external-invitation", addedByEmail: "email" };
            apiService.getShareExternalInvitations = jest.fn().mockResolvedValue([
                externalInvitation,
            ]);

            const sharingInfo = await sharingManagement.getSharingInfo("nodeUid");

            expect(sharingInfo).toEqual({
                protonInvitations: [],
                nonProtonInvitations: [externalInvitation],
                members: [],
                publicLink: undefined,
            });
            expect(cryptoService.decryptExternalInvitation).toHaveBeenCalledWith(externalInvitation);
        });

        it("should return members", async () => {
            const member = { uid: "member", addedByEmail: "email" };
            apiService.getShareMembers = jest.fn().mockResolvedValue([
                member,
            ]);

            const sharingInfo = await sharingManagement.getSharingInfo("nodeUid");

            expect(sharingInfo).toEqual({
                protonInvitations: [],
                nonProtonInvitations: [],
                members: [member],
                publicLink: undefined,
            });
            expect(cryptoService.decryptMember).toHaveBeenCalledWith(member);
        });

        it("should return public link", async () => {
            const publicLink = {
                uid: 'shared~publicLink',
            }
            apiService.getPublicLink = jest.fn().mockResolvedValue(publicLink);

            const sharingInfo = await sharingManagement.getSharingInfo("nodeUid");

            expect(sharingInfo).toEqual({
                protonInvitations: [],
                nonProtonInvitations: [],
                members: [],
                publicLink: publicLink,
            });
            expect(cryptoService.decryptPublicLink).toHaveBeenCalledWith(publicLink);
        });
    });

    describe("shareNode with share creation", () => {
        const nodeUid = "volumeId~nodeUid";

        it("should create share if no exists", async () => {
            nodesService.getNode = jest.fn().mockImplementation((nodeUid) => ({ nodeUid, parentUid: 'parentUid', name: { ok: true, value: "name" } }));

            const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: ["email"] });

            expect(sharingInfo).toEqual({
                protonInvitations: [{
                    uid: "created-invitation",
                    addedByEmail: { ok: true, value: "volume-email" },
                    inviteeEmail: "email",
                    role: "viewer",
                }],
                nonProtonInvitations: [],
                members: [],
                publicLink: undefined,
            });
            expect(apiService.updateInvitation).not.toHaveBeenCalled();
            expect(apiService.inviteProtonUser).toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).toHaveBeenCalledWith({
                uid: nodeUid,
                shareId: "newShareId",
                isShared: true,
            });
        });
    })

    describe("shareNode with share re-use", () => {
        const nodeUid = "volumeId~nodeUid";

        let invitation: ProtonInvitation;
        let externalInvitation: NonProtonInvitation;
        let member: Member;

        beforeEach(async () => {
            invitation = {
                uid: "invitation",
                addedByEmail: resultOk("added-email"),
                inviteeEmail: "internal-email",
                role: MemberRole.Viewer,
                invitationTime: new Date(),
            };
            externalInvitation = {
                uid: "external-invitation",
                addedByEmail: resultOk("added-email"),
                inviteeEmail: "external-email",
                role: MemberRole.Viewer,
                invitationTime: new Date(),
                state: NonProtonInvitationState.Pending,
            };
            member = {
                uid: "member",
                addedByEmail: resultOk("added-email"),
                inviteeEmail: "member-email",
                role: MemberRole.Viewer,
                invitationTime: new Date(),
            };

            apiService.getShareInvitations = jest.fn().mockResolvedValue([
                invitation,
            ]);

            apiService.getShareExternalInvitations = jest.fn().mockResolvedValue([
                externalInvitation,
            ]);

            apiService.getShareMembers = jest.fn().mockResolvedValue([
                member,
            ]);
        });

        describe("invitations", () => {
            beforeEach(() => {
                accountService.hasProtonAccount = jest.fn().mockResolvedValue(true);
            });

            it("should share node with proton email with default role", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: ["email"] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation, {
                        uid: "created-invitation",
                        addedByEmail: { ok: true, value: "volume-email" },
                        inviteeEmail: "email",
                        role: "viewer",
                    }],
                    nonProtonInvitations: [externalInvitation],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should share node with proton email with specific role", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "email", role: MemberRole.Editor }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation, {
                        uid: "created-invitation",
                        addedByEmail: { ok: true, value: "volume-email" },
                        inviteeEmail: "email",
                        role: "editor",
                    }],
                    nonProtonInvitations: [externalInvitation],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should update existing role", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "internal-email", role: MemberRole.Editor }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [{
                        ...invitation,
                        role: "editor",
                    }],
                    nonProtonInvitations: [externalInvitation],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateInvitation).toHaveBeenCalled();
                expect(apiService.inviteProtonUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should be no-op if no change", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "internal-email", role: MemberRole.Viewer }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });
        });

        describe("external invitations", () => {
            beforeEach(() => {
                accountService.hasProtonAccount = jest.fn().mockResolvedValue(false);
            });

            it("should share node with external email with default role", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: ["email"] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation, {
                        uid: "created-external-invitation",
                        addedByEmail: { ok: true, value: "volume-email" },
                        inviteeEmail: "email",
                        role: "viewer",
                        state: "pending",
                    }],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateExternalInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteExternalUser).toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should share node with external email with specific role", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "email", role: MemberRole.Editor }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation, {
                        uid: "created-external-invitation",
                        addedByEmail: { ok: true, value: "volume-email" },
                        inviteeEmail: "email",
                        role: "editor",
                        state: "pending",
                    }],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateExternalInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteExternalUser).toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should update existing role", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "external-email", role: MemberRole.Editor }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [{
                        ...externalInvitation,
                        role: "editor",
                    }],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateExternalInvitation).toHaveBeenCalled();
                expect(apiService.inviteExternalUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should be no-op if no change", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "external-email", role: MemberRole.Viewer }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateExternalInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteExternalUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });
        });

        describe("mix of internal and external invitations", () => {
            beforeEach(() => {
                accountService.hasProtonAccount = jest.fn()
                    .mockResolvedValueOnce(true)
                    .mockResolvedValueOnce(false);
            });

            it("should share node with proton and external email with default role", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: ["email", "email2"] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation, {
                        uid: "created-invitation",
                        addedByEmail: { ok: true, value: "volume-email" },
                        inviteeEmail: "email",
                        role: "viewer",
                    }],
                    nonProtonInvitations: [externalInvitation, {
                        uid: "created-external-invitation",
                        addedByEmail: { ok: true, value: "volume-email" },
                        inviteeEmail: "email2",
                        role: "viewer",
                        state: "pending",
                    }],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).toHaveBeenCalledWith("shareId", expect.objectContaining({
                    inviteeEmail: "email",
                }), expect.anything());
                expect(apiService.inviteExternalUser).toHaveBeenCalledWith("shareId", expect.objectContaining({
                    inviteeEmail: "email2",
                }), expect.anything());
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });
        });

        describe("members", () => {
            it("should update member via proton user", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "member-email", role: MemberRole.Editor }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation],
                    members: [{
                        ...member,
                        role: "editor",
                    }],
                    publicLink: undefined,
                });
                expect(apiService.updateMember).toHaveBeenCalled();
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should be no-op if no change via proton user", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "member-email", role: MemberRole.Viewer }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateMember).not.toHaveBeenCalled();
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should update member via non-proton user", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "member-email", role: MemberRole.Editor }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation],
                    members: [{
                        ...member,
                        role: "editor",
                    }],
                    publicLink: undefined,
                });
                expect(apiService.updateMember).toHaveBeenCalled();
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });

            it("should be no-op if no change via non-proton user", async () => {
                const sharingInfo = await sharingManagement.shareNode(nodeUid, { users: [{ email: "member-email", role: MemberRole.Viewer }] });

                expect(sharingInfo).toEqual({
                    protonInvitations: [invitation],
                    nonProtonInvitations: [externalInvitation],
                    members: [member],
                    publicLink: undefined,
                });
                expect(apiService.updateMember).not.toHaveBeenCalled();
                expect(apiService.updateInvitation).not.toHaveBeenCalled();
                expect(apiService.inviteProtonUser).not.toHaveBeenCalled();
                expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
            });
        });
    });

    describe("unsahreNode", () => {
        const nodeUid = "volumeId~nodeUid";

        let invitation: ProtonInvitation;
        let externalInvitation: NonProtonInvitation;
        let member: Member;
        let publicLink: PublicLink;

        beforeEach(async () => {
            invitation = {
                uid: "invitation",
                addedByEmail: resultOk("added-email"),
                inviteeEmail: "internal-email",
                role: MemberRole.Viewer,
                invitationTime: new Date(),
            };
            externalInvitation = {
                uid: "external-invitation",
                addedByEmail: resultOk("added-email"),
                inviteeEmail: "external-email",
                role: MemberRole.Viewer,
                invitationTime: new Date(),
                state: NonProtonInvitationState.Pending,
            };
            member = {
                uid: "member",
                addedByEmail: resultOk("added-email"),
                inviteeEmail: "member-email",
                role: MemberRole.Viewer,
                invitationTime: new Date(),
            };
            publicLink = {
                uid: "publicLink",
                creationTime: new Date(),
                role: MemberRole.Viewer,
                url: "url",
            }

            apiService.getShareInvitations = jest.fn().mockResolvedValue([
                invitation,
            ]);
            apiService.getShareExternalInvitations = jest.fn().mockResolvedValue([
                externalInvitation,
            ]);
            apiService.getShareMembers = jest.fn().mockResolvedValue([
                member,
            ]);
            apiService.getPublicLink = jest.fn().mockResolvedValue(publicLink);
        });

        it("should delete invitation", async () => {
            const sharingInfo = await sharingManagement.unshareNode(nodeUid, { users: ["internal-email"] });

            expect(sharingInfo).toEqual({
                protonInvitations: [],
                nonProtonInvitations: [externalInvitation],
                members: [member],
                publicLink,
            });
            expect(apiService.deleteShare).not.toHaveBeenCalled();
            expect(apiService.deleteInvitation).toHaveBeenCalled();
            expect(apiService.deleteExternalInvitation).not.toHaveBeenCalled();
            expect(apiService.removeMember).not.toHaveBeenCalled();
            expect(apiService.removePublicLink).not.toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
        });

        it("should delete external invitation", async () => {
            const sharingInfo = await sharingManagement.unshareNode(nodeUid, { users: ["external-email"] });

            expect(sharingInfo).toEqual({
                protonInvitations: [invitation],
                nonProtonInvitations: [],
                members: [member],
                publicLink,
            });
            expect(apiService.deleteShare).not.toHaveBeenCalled();
            expect(apiService.deleteInvitation).not.toHaveBeenCalled();
            expect(apiService.deleteExternalInvitation).toHaveBeenCalled();
            expect(apiService.removeMember).not.toHaveBeenCalled();
            expect(apiService.removePublicLink).not.toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
        });

        it("should remove member", async () => {
            const sharingInfo = await sharingManagement.unshareNode(nodeUid, { users: ["member-email"] });

            expect(sharingInfo).toEqual({
                protonInvitations: [invitation],
                nonProtonInvitations: [externalInvitation],
                members: [],
                publicLink,
            });
            expect(apiService.deleteShare).not.toHaveBeenCalled();
            expect(apiService.deleteInvitation).not.toHaveBeenCalled();
            expect(apiService.deleteExternalInvitation).not.toHaveBeenCalled();
            expect(apiService.removeMember).toHaveBeenCalled();
            expect(apiService.removePublicLink).not.toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
        });

        it("should be no-op if not shared with email", async () => {
            const sharingInfo = await sharingManagement.unshareNode(nodeUid, { users: ["non-existing-email"] });

            expect(sharingInfo).toEqual({
                protonInvitations: [invitation],
                nonProtonInvitations: [externalInvitation],
                members: [member],
                publicLink,
            });
            expect(apiService.deleteShare).not.toHaveBeenCalled();
            expect(apiService.deleteInvitation).not.toHaveBeenCalled();
            expect(apiService.deleteExternalInvitation).not.toHaveBeenCalled();
            expect(apiService.removeMember).not.toHaveBeenCalled();
            expect(apiService.removePublicLink).not.toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
        });

        it("should remove public link", async () => {
            const sharingInfo = await sharingManagement.unshareNode(nodeUid, { publicLink: "remove" });

            expect(sharingInfo).toEqual({
                protonInvitations: [invitation],
                nonProtonInvitations: [externalInvitation],
                members: [member],
                publicLink: undefined,
            });
            expect(apiService.deleteShare).not.toHaveBeenCalled();
            expect(apiService.deleteInvitation).not.toHaveBeenCalled();
            expect(apiService.deleteExternalInvitation).not.toHaveBeenCalled();
            expect(apiService.removeMember).not.toHaveBeenCalled();
            expect(apiService.removePublicLink).toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).not.toHaveBeenCalled();
        });

        it("should remove share if all is removed", async () => {
            const sharingInfo = await sharingManagement.unshareNode(nodeUid);

            expect(sharingInfo).toEqual(undefined);
            expect(apiService.deleteShare).toHaveBeenCalled();
            expect(apiService.deleteInvitation).not.toHaveBeenCalled();
            expect(apiService.deleteExternalInvitation).not.toHaveBeenCalled();
            expect(apiService.removeMember).not.toHaveBeenCalled();
            expect(apiService.removePublicLink).not.toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).toHaveBeenCalledWith({
                uid: nodeUid,
                shareId: undefined,
                isShared: false,
            });
        });

        it("should remove share if everything is manually removed", async () => {
            const sharingInfo = await sharingManagement.unshareNode(nodeUid, {
                users: ["internal-email", "external-email", "member-email"],
                publicLink: "remove",
            });

            expect(sharingInfo).toEqual(undefined);
            expect(apiService.deleteShare).toHaveBeenCalled();
            expect(apiService.deleteInvitation).toHaveBeenCalled();
            expect(apiService.deleteExternalInvitation).toHaveBeenCalled();
            expect(apiService.removeMember).toHaveBeenCalled();
            expect(apiService.removePublicLink).toHaveBeenCalled();
            expect(nodesEvents.nodeUpdated).toHaveBeenCalledWith({
                uid: nodeUid,
                shareId: undefined,
                isShared: false,
            });
        });
    });
});
