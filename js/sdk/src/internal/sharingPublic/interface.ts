import { PrivateKey, SessionKey } from "../../crypto";
import { NodeType, Result, InvalidNameError } from "../../interface";

export interface EncryptedShareCrypto {
    base64UrlPasswordSalt: string;
    armoredKey: string;
    armoredPassphrase: string;
}

// TODO: reuse node entity, or keep custom?
interface BaseNode {
    // Internal metadata
    hash?: string; // root node doesn't have any hash
    encryptedName: string;

    // Basic node metadata
    uid: string;
    parentUid?: string;
    type: NodeType;
    mediaType?: string;
    totalStorageSize?: number;
}

export interface EncryptedNode extends BaseNode {
    encryptedCrypto: EncryptedNodeFolderCrypto | EncryptedNodeFileCrypto;
}

export interface EncryptedNodeCrypto {
    signatureEmail?: string;
    armoredKey: string;
    armoredNodePassphrase: string;
    armoredNodePassphraseSignature?: string;
}

export interface EncryptedNodeFileCrypto extends EncryptedNodeCrypto {
    file: {
        base64ContentKeyPacket: string;
    };
}

export interface EncryptedNodeFolderCrypto extends EncryptedNodeCrypto {
    folder: {
        armoredExtendedAttributes?: string;
        armoredHashKey: string;
    };
}

export interface DecryptedNode extends BaseNode {
    name: Result<string, Error | InvalidNameError>;
    errors?: unknown[];
}

export interface DecryptedNodeKeys {
    passphrase: string;
    key: PrivateKey;
    passphraseSessionKey: SessionKey;
    contentKeyPacketSessionKey?: SessionKey;
    hashKey?: Uint8Array;
}
