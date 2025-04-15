import { PrivateKey, SessionKey } from "../../crypto";
import { MetricContext, ThumbnailType } from "../../interface";

export type NodeRevisionDraft = {
    nodeUid: string,
    nodeRevisionUid: string,
    nodeKeys: NodeRevisionDraftKeys,
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
    getNodeKeys(nodeUid: string): Promise<{ key: PrivateKey, passphraseSessionKey: SessionKey, hashKey?: Uint8Array }>,
}

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getVolumeEmailKey(volumeId: string): Promise<{ email: string, addressId: string, addressKey: PrivateKey }>,
    getVolumeMetricContext(volumeId: string): Promise<MetricContext>,
}
