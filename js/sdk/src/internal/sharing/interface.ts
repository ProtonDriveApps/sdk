import { NodeEntity, NodeType, MemberRole, NonProtonInvitationState } from "../../interface";
import { PrivateKey, SessionKey } from "../../crypto";
import { EncryptedShare } from "../shares";

export enum SharingType {
    SharedByMe = 'sharedByMe',
    sharedWithMe = 'sharedWithMe',
}

/**
 * Internal interface for creating new invitation.
 */
export interface EncryptedInvitationRequest {
    addedByEmail: string;
    inviteeEmail: string;
    base64KeyPacket: string;
    base64KeyPacketSignature: string;
    role: MemberRole;
}

/**
 * Internal interface of existing invitation on the API.
 * 
 * This interface is used only for managing the invitations. For listing
 * invitations with node metadata, see `EncryptedInvitationWithNode`.
 */
export interface EncryptedInvitation extends EncryptedInvitationRequest {
    uid: string;
    invitedDate: Date;
}

/**
 * Internal interface of existing invitation with the share and node metadata.
 * 
 * Invitation with node is used for listing shared nodes with me, so it includes
 * what is being shared as well.
 */
export interface EncryptedInvitationWithNode extends EncryptedInvitation {
    share: {
        armoredKey: string;
        armoredPassphrase: string;
        creatorEmail: string;
    };
    node: {
        type: NodeType;
        mimeType?: string;
        encryptedName: string;
    }
}

/**
 * Internal interface for creating new external invitation.
 */
export interface EncryptedExternalInvitationRequest {
    inviterAddressId: string;
    inviteeEmail: string;
    role: MemberRole;
    base64Signature: string;
}

/**
 * Internal interface of existing external invitation on the API.
 */
export interface EncryptedExternalInvitation extends Omit<EncryptedExternalInvitationRequest, 'inviterAddressId'> {
    uid: string;
    invitedDate: Date;
    addedByEmail: string;
    state: NonProtonInvitationState;
}

/**
 * Internal interface of existing member on the API.
 */
export interface EncryptedMember {
    uid: string;
    invitedDate: Date;
    addedByEmail: string;
    inviteeEmail: string;
    role: MemberRole;
    base64KeyPacket: string;
    base64KeyPacketSignature: string;
}

/**
 * Internal interface of existing member with the share and node metadata.
 */
export interface EncryptedBookmark {
    tokenId: string;
    createdDate: Date;
    share: {
        armoredKey: string;
        armoredPassphrase: string;
    };
    url: {
        encryptedUrlPassword?: string;
        base64SharePasswordSalt: string;
    };
    node: {
        type: NodeType;
        mimeType?: string;
        encryptedName: string;
        armoredKey: string;
        armoredNodePassphrase: string;
        file: {
            base64ContentKeyPacket?: string;
        };
    };
}

export interface EncryptedPublicLink {
    uid: string,
    createDate: Date,
    expireDate?: Date,
    role: MemberRole,
    flags: number,
    creatorEmail: string,
    publicUrl: string,
    armoredUrlPassword: string,
    urlPasswordSalt: string,
    base64SharePassphraseKeyPacket: string,
    sharePassphraseSalt: string,
}

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getMyFilesIDs(): Promise<{ volumeId: string }>,
    getVolumeEmailKey(volumeId: string): Promise<{ addressId: string, email: string, addressKey: PrivateKey }>,
    loadEncryptedShare(shareId: string): Promise<EncryptedShare>,
}

/**
 * Interface describing the dependencies to the nodes module.
 */
export interface NodesService {
    getNode(nodeUid: string): Promise<NodeEntity & { shareId?: string }>,
    getNodeKeys(nodeUid: string): Promise<{ key: PrivateKey }>,
    getNodePrivateAndSessionKeys(nodeUid: string): Promise<{
        key: PrivateKey,
        passphraseSessionKey: SessionKey,
        nameSessionKey: SessionKey,
    }>,
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeEntity>;
}
