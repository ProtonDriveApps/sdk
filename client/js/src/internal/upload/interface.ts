import { PrivateKey, SessionKey } from '../../crypto';
import { AnonymousUser, MetricVolumeType, Revision, ThumbnailType, UploadMetadata } from '../../interface';
import { DecryptedNode } from '../nodes';

/**
 * `UploadMetadata` narrowed to a definitely-known `expectedSize`.
 *
 * Internal-only: the small-file (single-request) upload path requires the
 * exact size upfront and is only ever reached from `Uploader.startUpload`
 * after it has confirmed `metadata.expectedSize !== null`. Threading this
 * type down to `SmallUploader` and its subclasses means that invariant is
 * enforced once, at that call site, instead of being re-asserted (via casts)
 * at every read of `expectedSize` inside the small-file uploader.
 */
export type UploadMetadataWithKnownSize = UploadMetadata & { expectedSize: number };

export type NodeRevisionDraft = {
    nodeUid: string;
    nodeRevisionUid: string;
    nodeKeys: NodeRevisionDraftKeys;
    parentNodeKeys?: {
        hashKey: Uint8Array<ArrayBuffer>;
    };
    // newNodeInfo is set only when revision is created with the new node.
    newNodeInfo?: {
        parentUid: string;
        name: string;
        encryptedName: string;
        hash: string;
    };
};

export type NodeRevisionDraftKeys = {
    key: PrivateKey;
    contentKeyPacketSessionKey: SessionKey;
    signingKeys: NodeCryptoSigningKeys;
};

export type NodeCrypto = {
    nodeKeys: {
        encrypted: {
            armoredKey: string;
            armoredPassphrase: string;
            armoredPassphraseSignature: string;
        };
        decrypted: {
            passphrase: string;
            key: PrivateKey;
            passphraseSessionKey: SessionKey;
        };
    };
    contentKey: {
        encrypted: {
            contentKeyPacket: Uint8Array<ArrayBuffer>;
            base64ContentKeyPacket: string;
            armoredContentKeyPacketSignature: string;
        };
        decrypted: {
            contentKeyPacketSessionKey: SessionKey;
        };
    };
    encryptedNode: {
        encryptedName: string;
        hash: string;
    };
    signingKeys: NodeCryptoSigningKeys;
};

export type NodeCryptoSigningKeys = {
    email: string | AnonymousUser;
    addressId: string | AnonymousUser;
    nameAndPassphraseSigningKey: PrivateKey;
    contentSigningKey: PrivateKey;
};

export type EncryptedBlockMetadata = {
    encryptedSize: number;
    originalSize: number;
    hashPromise: Promise<Uint8Array<ArrayBuffer>>;
};

export type EncryptedBlock = EncryptedBlockMetadata & {
    index: number;
    encryptedData: Uint8Array<ArrayBuffer>;
    armoredSignature: string;
    verificationToken: Uint8Array<ArrayBuffer>;
};

export type EncryptedThumbnail = EncryptedBlockMetadata & {
    type: ThumbnailType;
    encryptedData: Uint8Array<ArrayBuffer>;
};

export type UploadTokens = {
    blockTokens: {
        index: number;
        bareUrl: string;
        token: string;
    }[];
    thumbnailTokens: {
        type: ThumbnailType;
        bareUrl: string;
        token: string;
    }[];
};

/**
 * Interface describing the dependencies to the nodes module.
 */
export interface NodesService {
    getNode(nodeUid: string): Promise<NodesServiceNode>;
    getNodeKeys(nodeUid: string): Promise<{
        key: PrivateKey;
        passphraseSessionKey: SessionKey;
        contentKeyPacket?: Uint8Array<ArrayBuffer>;
        contentKeyPacketSessionKey?: SessionKey;
        hashKey?: Uint8Array<ArrayBuffer>;
    }>;
    getNodeSigningKeys(
        uids: { nodeUid: string; parentNodeUid?: string } | { nodeUid?: string; parentNodeUid: string },
    ): Promise<NodeSigningKeys>;
    notifyNodeChanged(nodeUid: string): Promise<void>;
}

/**
 * Interface describing the dependencies to the nodes module.
 */
export interface NodesEvents {
    nodeCreated(node: DecryptedNode): Promise<void>;
    nodeUpdated(partialNode: { uid: string; activeRevision: Revision }): Promise<void>;
}

export interface NodesServiceNode {
    uid: string;
    parentUid?: string;
    activeRevision?: Revision;
}

export type NodeSigningKeys =
    | {
          type: 'userAddress';
          email: string;
          addressId: string;
          key: PrivateKey;
      }
    | {
          type: 'nodeKey';
          nodeKey?: PrivateKey;
          parentNodeKey?: PrivateKey;
      };

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getVolumeMetricContext(volumeId: string): Promise<MetricVolumeType>;
}
