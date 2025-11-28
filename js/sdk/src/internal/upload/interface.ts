import { PrivateKey, SessionKey } from '../../crypto';

import { MetricVolumeType, ThumbnailType, Result, Revision, AnonymousUser } from '../../interface';
import { DecryptedNode } from '../nodes';

export type NodeRevisionDraft = {
    nodeUid: string;
    nodeRevisionUid: string;
    nodeKeys: NodeRevisionDraftKeys;
    parentNodeKeys?: {
        hashKey: Uint8Array;
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
    hash: Uint8Array;
};

export type EncryptedBlock = EncryptedBlockMetadata & {
    index: number;
    encryptedData: Uint8Array;
    armoredSignature: string;
    verificationToken: Uint8Array;
};

export type EncryptedThumbnail = EncryptedBlockMetadata & {
    type: ThumbnailType;
    encryptedData: Uint8Array;
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
        contentKeyPacketSessionKey?: SessionKey;
        hashKey?: Uint8Array;
    }>;
    getNodeSigningKeys(
        uids: { nodeUid: string; parentNodeUid?: string } | { nodeUid?: string; parentNodeUid: string },
    ): Promise<NodeSigningKeys>;
    notifyChildCreated(nodeUid: string): Promise<void>;
    notifyNodeChanged(nodeUid: string): Promise<void>;
}

/**
 * Interface describing the dependencies to the nodes module.
 */
export interface NodesEvents {
    nodeCreated(node: DecryptedNode): Promise<void>;
    nodeUpdated(partialNode: { uid: string; activeRevision: Result<Revision, Error> }): Promise<void>;
}

export interface NodesServiceNode {
    uid: string;
    parentUid?: string;
    activeRevision?: Result<Revision, Error>;
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
