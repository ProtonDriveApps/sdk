import { PrivateKey, SessionKey } from "../../crypto";

import { MetricContext, ThumbnailType, Result, Revision } from "../../interface";
import { DecryptedNode } from "../nodes";

export type NodeRevisionDraft = {
    nodeUid: string,
    nodeRevisionUid: string,
    nodeKeys: NodeRevisionDraftKeys,
    // newNodeInfo is set only when revision is created with the new node.
    newNodeInfo?: {
        parentUid: string,
        name: string,
        encryptedName: string,
        hash: string,
    }
}

export type NodeRevisionDraftKeys = {
    key: PrivateKey,
    contentKeyPacketSessionKey: SessionKey,
    signatureAddress: NodeCryptoSignatureAddress,
}

export type NodeCrypto = {
    nodeKeys: {
        encrypted: {
            armoredKey: string,
            armoredPassphrase: string,
            armoredPassphraseSignature: string,
        },
        decrypted: {
            passphrase: string,
            key: PrivateKey,
            passphraseSessionKey: SessionKey,
        },
    },
    contentKey: {
        encrypted: {
            base64ContentKeyPacket: string,
            armoredContentKeyPacketSignature: string,
        },
        decrypted: {
            contentKeyPacketSessionKey: SessionKey,
        },
    },
    encryptedNode: {
        encryptedName: string,
        hash: string,
    },
    signatureAddress: NodeCryptoSignatureAddress,
}

export type NodeCryptoSignatureAddress = {
    email: string,
    addressId: string,
    addressKey: PrivateKey,
}

export type EncryptedBlockMetadata = {
    encryptedSize: number,
    originalSize: number,
    hash: Uint8Array,
}

export type EncryptedBlock = EncryptedBlockMetadata & {
    index: number,
    encryptedData: Uint8Array,
    armoredSignature: string,
    verificationToken: Uint8Array,
}

export type EncryptedThumbnail = EncryptedBlockMetadata & {
    type: ThumbnailType,
    encryptedData: Uint8Array,
}

export type UploadTokens = {
    blockTokens: {
        index: number,
        bareUrl: string,
        token: string,
    }[],
    thumbnailTokens: {
        type: ThumbnailType,
        bareUrl: string,
        token: string,
    }[],
}

/**
 * Interface describing the dependencies to the nodes module.
 */
export interface NodesService {
    getNode(nodeUid: string): Promise<NodesServiceNode>,
    getNodeKeys(nodeUid: string): Promise<{
        key: PrivateKey,
        passphraseSessionKey: SessionKey,
        contentKeyPacketSessionKey?: SessionKey,
        hashKey?: Uint8Array,
    }>,
}

/**
 * Interface describing the dependencies to the nodes module.
 */
export interface NodesEvents {
    nodeCreated(node: DecryptedNode): Promise<void>,
    nodeUpdated(partialNode: { uid: string, activeRevision: Result<Revision, Error> }): Promise<void>,
}

export interface NodesServiceNode {
    uid: string,
    activeRevision?: Result<Revision, Error>,
}

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getVolumeEmailKey(volumeId: string): Promise<{ email: string, addressId: string, addressKey: PrivateKey }>,
    getVolumeMetricContext(volumeId: string): Promise<MetricContext>,
}
