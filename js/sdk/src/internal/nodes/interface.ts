import { PrivateKey, SessionKey } from "../../crypto";
import { Result, InvalidNameError, AnonymousUser, UnverifiedAuthorError, MemberRole, NodeType, Revision } from "../../interface";

/**
 * Internal common node interface for both encrypted or decrypted node.
 */
interface BaseNode {
    // Internal metadata
    volumeId: string;
    hash?: string; // root node doesn't have any hash

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
    encryptedName: string;

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
    activeRevision: {
        id: string;
        encryptedExtendedAttributes?: string;
    };
}

export interface EncryptedNodeFolderCrypto extends EncryptedNodeCrypto {
    folder: {
        encryptedExtendedAttributes?: string;
        armoredHashKey: string;
    };
}

/**
 * Interface holding decrypted node metadata.
 */
export interface DecryptedNode extends BaseNode {
    // Internal metadata
    isStale: boolean;

    keyAuthor: Result<string | AnonymousUser, UnverifiedAuthorError>,
    nameAuthor: Result<string | AnonymousUser, UnverifiedAuthorError>,
    name: Result<string, InvalidNameError>,
    activeRevision: Result<null | Revision, Error>, // null for folders
}

export interface DecryptedNodeKeys {
    passphrase: string;
    key: PrivateKey;
    sessionKey: SessionKey;
    hashKey?: Uint8Array;
}

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getMyFilesIDs(): Promise<{ volumeId: string, rootNodeId: string }>,
    getSharePrivateKey(shareId: string): Promise<PrivateKey>,
    getVolumeEmailKey(volumeId: string): Promise<{ email: string, key: PrivateKey }>,
}
