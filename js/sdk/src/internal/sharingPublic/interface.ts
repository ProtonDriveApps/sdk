// TODO: use them directly, or avoid them completely
export type {
    EncryptedNode,
    EncryptedNodeFolderCrypto,
    EncryptedNodeFileCrypto,
    DecryptedNode,
    DecryptedNodeKeys,
} from '../nodes/interface';

export interface EncryptedShareCrypto {
    base64UrlPasswordSalt: string;
    armoredKey: string;
    armoredPassphrase: string;
}
