import { PrivateKey, SessionKey } from "../../crypto";
import { NodeEntity, Result, InvalidNameError, Author, MemberRole, NodeType, Revision } from "../../interface";
import { RevisionState } from "../../interface/nodes";

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
    mimeType?: string;
    createdDate: Date; // created on the server
    trashedDate?: Date;

    // Share node metadata
    shareId?: string;
    isShared: boolean,
    directMemberRole: MemberRole,
}

/**
 * Interface used only internaly in the nodes module.
 * 
 * Outside of the module, the decrypted node interface should be used.
 */
export interface EncryptedNode extends BaseNode {
    encryptedCrypto: EncryptedNodeFolderCrypto | EncryptedNodeFileCrypto;
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

/**
 * Interface used only internally in the nodes module.
 *
 * Outside of the module, the decrypted node interface should be used.
 *
 * This interface is holding decrypted node metadata that is not yet parsed,
 * such as extended attributes.
 */
export interface DecryptedUnparsedNode extends BaseNode {
    keyAuthor: Author,
    nameAuthor: Author,
    name: Result<string, InvalidNameError>,
    activeRevision?: Result<DecryptedRevision, Error>,
    folder?: {
        extendedAttributes?: string,
    },
}

/**
 * Interface holding decrypted node metadata.
 */
export interface DecryptedNode extends Omit<DecryptedUnparsedNode, 'activeRevision' | 'folder'>, NodeEntity {
    // Internal metadata
    isStale: boolean;

    activeRevision?: Result<Revision, Error>,
    folder?: {
        claimedModificationTime?: Date,
    },
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
    createdDate: Date; // created on the server
}

export interface EncryptedRevision extends BaseRevision {
    signatureEmail?: string;
    armoredExtendedAttributes?: string;
}

export interface DecryptedRevision extends BaseRevision {
    contentAuthor: Author,
    extendedAttributes?: string,
}

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getMyFilesIDs(): Promise<{ volumeId: string, rootNodeId: string }>,
    getSharePrivateKey(shareId: string): Promise<PrivateKey>,
    getVolumeEmailKey(volumeId: string): Promise<{ email: string, addressKey: PrivateKey }>,
}
