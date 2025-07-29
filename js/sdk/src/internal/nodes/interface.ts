import { PrivateKey, SessionKey } from '../../crypto';
import {
    NodeEntity,
    Result,
    InvalidNameError,
    Author,
    MemberRole,
    NodeType,
    ThumbnailType,
    MetricVolumeType,
    Revision,
    RevisionState,
} from '../../interface';

/**
 * Internal common node interface for both encrypted or decrypted node.
 */
interface BaseNode {
    // Internal metadata
    hash?: string; // root node doesn't have any hash
    encryptedName: string;

    // Basic node metadata
    uid: string;
    parentUid?: string;
    type: NodeType;
    mediaType?: string;
    creationTime: Date; // created on the server
    trashTime?: Date;
    totalStorageSize?: number;

    // Share node metadata
    shareId?: string;
    isShared: boolean;
    directMemberRole: MemberRole;
}

/**
 * Interface used only internaly in the nodes module.
 *
 * Outside of the module, the decrypted node interface should be used.
 */
export interface EncryptedNode extends BaseNode {
    encryptedCrypto: EncryptedNodeFolderCrypto | EncryptedNodeFileCrypto | EncryptedNodeAlbumCrypto;
}

export interface EncryptedNodeCrypto {
    signatureEmail?: string;
    nameSignatureEmail?: string;
    armoredKey: string;
    armoredNodePassphrase: string;
    armoredNodePassphraseSignature: string;
}

export interface EncryptedNodeFileCrypto extends EncryptedNodeCrypto {
    file: {
        base64ContentKeyPacket: string;
        armoredContentKeyPacketSignature?: string;
    };
    activeRevision: EncryptedRevision;
}

export interface EncryptedNodeFolderCrypto extends EncryptedNodeCrypto {
    folder: {
        armoredExtendedAttributes?: string;
        armoredHashKey: string;
    };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EncryptedNodeAlbumCrypto extends EncryptedNodeCrypto {}

/**
 * Interface used only internally in the nodes module.
 *
 * Outside of the module, the decrypted node interface should be used.
 *
 * This interface is holding decrypted node metadata that is not yet parsed,
 * such as extended attributes.
 */
export interface DecryptedUnparsedNode extends BaseNode {
    keyAuthor: Author;
    nameAuthor: Author;
    name: Result<string, Error>;
    activeRevision?: Result<DecryptedUnparsedRevision, Error>;
    folder?: {
        extendedAttributes?: string;
    };
    errors?: unknown[];
}

/**
 * Interface holding decrypted node metadata.
 */
export interface DecryptedNode
    extends Omit<DecryptedUnparsedNode, 'name' | 'activeRevision' | 'folder'>,
        Omit<NodeEntity, 'name' | 'activeRevision'> {
    // Internal metadata
    isStale: boolean;
    name: Result<string, Error | InvalidNameError>;

    activeRevision?: Result<DecryptedRevision, Error>;
    folder?: {
        claimedModificationTime?: Date;
    };
}

/**
 * Interface holding decrypted node key, including session key, and hash key.
 *
 * These keys are cached as they are needed for various actions on the node.
 *
 * Passphrase, for example, might be removed at some point. It is needed as
 * at this moment the move requires both node key passphrase and the session
 * key.
 */
export interface DecryptedNodeKeys {
    passphrase: string;
    key: PrivateKey;
    passphraseSessionKey: SessionKey;
    contentKeyPacketSessionKey?: SessionKey;
    hashKey?: Uint8Array;
}

interface BaseRevision {
    uid: string;
    state: RevisionState;
    creationTime: Date; // created on the server
    storageSize: number;
    thumbnails: Thumbnail[];
}

export type Thumbnail = {
    uid: string;
    type: ThumbnailType;
};

export interface EncryptedRevision extends BaseRevision {
    signatureEmail?: string;
    armoredExtendedAttributes?: string;
}

export interface DecryptedUnparsedRevision extends BaseRevision {
    contentAuthor: Author;
    extendedAttributes?: string;
}

export interface DecryptedRevision extends Revision {
    thumbnails?: Thumbnail[];
}

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getMyFilesIDs(): Promise<{ volumeId: string; rootNodeId: string }>;
    getSharePrivateKey(shareId: string): Promise<PrivateKey>;
    getMyFilesShareMemberEmailKey(): Promise<{
        email: string;
    }>;
    getContextShareMemberEmailKey(shareId: string): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }>;
    getVolumeMetricContext(volumeId: string): Promise<MetricVolumeType>;
}
