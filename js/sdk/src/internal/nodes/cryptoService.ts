import { DriveCrypto, PrivateKey, PublicKey, SessionKey, VERIFICATION_STATUS } from "../../crypto";
import { resultOk, resultError, Result, InvalidNameError, AnonymousUser, UnverifiedAuthorError, ProtonDriveAccount } from "../../interface";
import { EncryptedNode, EncryptedNodeFolderCrypto, DecryptedNode, DecryptedNodeKeys, SharesService } from "./interface";

// TODO: Switch to CryptoProxy module once available.
import { importHmacKey, computeHmacSignature } from "./hmac";

/**
 * Provides crypto operations for nodes metadata.
 * 
 * The node crypto service is responsible for decrypting and encrypting node
 * metadata. It should export high-level actions only, such as "decrypt node"
 * instead of low-level operations like "decrypt node key". Low-level operations
 * should be kept private to the module.
 * 
 * The service owns the logic to switch between old and new crypto model.
 */
export class NodesCryptoService {
    constructor(
        private driveCrypto: DriveCrypto,
        private account: ProtonDriveAccount,
        private shareService: SharesService,
    ) {
        this.driveCrypto = driveCrypto;
        this.account = account;
        this.shareService = shareService;
    }

    async decryptNode(node: EncryptedNode, parentKey: PrivateKey): Promise<{ node: DecryptedNode, keys?: DecryptedNodeKeys }> {
        const commonNodeMetadata = {
            ...node,
            encryptedCrypto: undefined,
        }

        // Anonymous uploads (without signature email set) use parent key instead.
        const keyVerificationKeys = node.encryptedCrypto.signatureEmail
            ? await this.account.getPublicKeys(node.encryptedCrypto.signatureEmail)
            : [parentKey];

        let nameVerificationKeys;
        const nameSignatureEmail = node.encryptedCrypto.nameSignatureEmail || node.encryptedCrypto.signatureEmail;
        if (nameSignatureEmail === node.encryptedCrypto.signatureEmail) {
            nameVerificationKeys = keyVerificationKeys;
        } else {
            nameVerificationKeys = nameSignatureEmail
                ? await this.account.getPublicKeys(nameSignatureEmail)
                : [parentKey];
        }

        let passphrase, key, sessionKey, keyAuthor;
        try {
            const keyResult = await this.decryptKey(node, parentKey, keyVerificationKeys);
            passphrase = keyResult.passphrase;
            key = keyResult.key;
            sessionKey = keyResult.sessionKey;
            keyAuthor = keyResult.author;
        } catch (error: unknown) {
            const errorMessage = `Failed to decrypt node key: ${error instanceof Error ? error.message : 'Unknown error'}`;
            return {
                node: {
                    ...commonNodeMetadata,
                    isStale: false,
                    name: resultError({
                        name: '',
                        error: errorMessage,
                    }),
                    keyAuthor: resultError({
                        claimedAuthor: node.encryptedCrypto.signatureEmail,
                        error: errorMessage,
                    }),
                    nameAuthor: resultError({
                        claimedAuthor: nameSignatureEmail,
                        error: errorMessage,
                    }),
                    activeRevision: resultError(new Error(errorMessage)),
                }
            }
        }

        const { name, author: nameAuthor } = await this.decryptName(node, parentKey, nameVerificationKeys);

        let hashKey;
        let hashKeyAuthor;
        if ("folder" in node.encryptedCrypto) {
            const hashKeyResult = await this.decryptHashKey(node, key, keyVerificationKeys);
            hashKey = hashKeyResult.hashKey;
            hashKeyAuthor = hashKeyResult.author;
        }

        return {
            node: {
                ...commonNodeMetadata,
                isStale: false,
                name,
                // If key signature verificaiton failed, prefer showing error from the key directly.
                keyAuthor: keyAuthor.ok && hashKeyAuthor && !hashKeyAuthor.ok ? hashKeyAuthor : keyAuthor,
                nameAuthor,
                activeRevision: resultOk(null), // TODO: Decrypt extended attributes
            },
            keys: {
                passphrase,
                key,
                sessionKey,
                hashKey,
            },
        };
    };

    async decryptKey(node: EncryptedNode, parentKey: PrivateKey, verificationKeys: PublicKey[]): Promise<DecryptedNodeKeys & {
        author: Result<string | AnonymousUser, UnverifiedAuthorError>,
    }> {
        const key = await this.driveCrypto.decryptKey(
            node.encryptedCrypto.armoredKey,
            node.encryptedCrypto.armoredNodePassphrase,
            node.encryptedCrypto.armoredNodePassphraseSignature,
            [parentKey],
            verificationKeys,
        );

        return {
            passphrase: key.passphrase,
            key: key.key,
            sessionKey: key.sessionKey,
            author: handleClaimedAuthor('key', key.verified, node.encryptedCrypto.signatureEmail),
        };
    };

    async decryptName(node: EncryptedNode, parentKey: PrivateKey, verificationKeys: PrivateKey[]): Promise<{
        name: Result<string, InvalidNameError>,
        author: Result<string | AnonymousUser, UnverifiedAuthorError>,
    }> {
        const nameSignatureEmail = node.encryptedCrypto.nameSignatureEmail || node.encryptedCrypto.signatureEmail;

        try {
            const { name, verified } = await this.driveCrypto.decryptNodeName(
                node.encryptedCrypto.encryptedName,
                parentKey,
                verificationKeys,
            );

            return {
                name: resultOk(name),
                author: handleClaimedAuthor('name', verified, nameSignatureEmail),
            }
        } catch (error: unknown) {
            // TODO: Translation
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                name: resultError({
                    name: '',
                    error: message,
                }),
                author: resultError({
                    claimedAuthor: nameSignatureEmail,
                    error: message,
                }),
            }
        }
    };

    async decryptHashKey(node: EncryptedNode, nodeKey: PrivateKey, addressKeys: PublicKey[]): Promise<{
        hashKey: Uint8Array,
        author: Result<string | AnonymousUser, UnverifiedAuthorError>,
    }> {
        if (!("folder" in node.encryptedCrypto)) {
            throw new Error('Node is not a folder');
        }

        const { hashKey, verified } = await this.driveCrypto.decryptNodeHashKey(
            node.encryptedCrypto.folder.armoredHashKey,
            nodeKey,
            addressKeys,
        );

        return {
            hashKey,
            author: handleClaimedAuthor('hash key', verified, node.encryptedCrypto.signatureEmail),
        }
    }

    async createFolder(parentNode: DecryptedNode, parentKeys: { key: PrivateKey, hashKey: Uint8Array }, name: string): Promise<{
        encryptedCrypto: Required<EncryptedNodeFolderCrypto> & { hash: string },
        keys: DecryptedNodeKeys,
    }> {
        const { email, key: addressKey } = await this.shareService.getVolumeEmailKey(parentNode.volumeId);
        const [
            nodeKeys,
            { armoredNodeName },
            hash,
        ] = await Promise.all([
            this.driveCrypto.generateKey([parentKeys.key], addressKey),
            this.driveCrypto.encryptNodeName(name, parentKeys.key, addressKey),
            this.generateLookupHash(name, parentKeys.hashKey),
        ]);

        const { armoredHashKey, hashKey } = await this.driveCrypto.generateHashKey(nodeKeys.decrypted.key);

        return {
            encryptedCrypto: {
                encryptedName: armoredNodeName,
                hash,
                armoredKey: nodeKeys.encrypted.armoredKey,
                armoredNodePassphrase: nodeKeys.encrypted.armoredPassphrase,
                armoredNodePassphraseSignature: nodeKeys.encrypted.armoredPassphraseSignature,
                folder: {
                    encryptedExtendedAttributes: '',
                    armoredHashKey,
                },
                signatureEmail: email,
                nameSignatureEmail: email,
            },
            keys: {
                passphrase: nodeKeys.decrypted.passphrase,
                key: nodeKeys.decrypted.key,
                sessionKey: nodeKeys.decrypted.sessionKey,
                hashKey,
            },
        };
    }

    async encryptNewName(node: DecryptedNode, parentKeys: { key: PrivateKey, hashKey: Uint8Array }, newName: string): Promise<{
        signatureEmail: string,
        armoredNodeName: string,
        hash: string,
    }> {
        const { email, key: addressKey } = await this.shareService.getVolumeEmailKey(node.volumeId);
        const { armoredNodeName } = await this.driveCrypto.encryptNodeName(newName, parentKeys.key, addressKey);
        const hash = await this.generateLookupHash(newName, parentKeys.hashKey);
        return {
            signatureEmail: email,
            armoredNodeName,
            hash,
        };
    };

    async moveNode(node: DecryptedNode, keys: { passphrase: string, sessionKey: SessionKey }, parentNode: DecryptedNode, parentKeys: { key: PrivateKey, hashKey: Uint8Array }): Promise<{
        encryptedName: string,
        hash: string,
        armoredNodePassphrase: string,
        armoredNodePassphraseSignature: string,
        signatureEmail: string,
        nameSignatureEmail: string,
    }> {
        if (!parentKeys.hashKey) {
            throw new Error('Moving nodes to a non-folder is not supported');
        }
        if (!node.name.ok) {
            throw new Error('Cannot move node without a valid name, please rename the node first');
        }

        const { email, key: addressKey } = await this.shareService.getVolumeEmailKey(parentNode.volumeId);
        const { armoredNodeName } = await this.driveCrypto.encryptNodeName(node.name.value, parentKeys.key, addressKey);
        const hash = await this.generateLookupHash(node.name.value, parentKeys.hashKey);
        const { armoredPassphrase, armoredPassphraseSignature } = await this.driveCrypto.encryptPassphrase(keys.passphrase, keys.sessionKey, [parentKeys.key], addressKey);

        return {
            encryptedName: armoredNodeName,
            hash,
            armoredNodePassphrase: armoredPassphrase,
            armoredNodePassphraseSignature: armoredPassphraseSignature,
            signatureEmail: email,
            nameSignatureEmail: email,
        };
    }

    async generateLookupHash(newName: string, parentHashKey: Uint8Array): Promise<string> {
        const key = await importHmacKey(parentHashKey);

        const signature = await computeHmacSignature(key, new TextEncoder().encode(newName));
        return arrayToHexString(signature);
    }
}

function handleClaimedAuthor(signatureType: string, verified: VERIFICATION_STATUS, claimedAuthor?: string): Result<string | AnonymousUser, UnverifiedAuthorError> {
    if (!claimedAuthor) {
        return resultOk(null); // Anonymous user
    }
    
    if (verified === VERIFICATION_STATUS.SIGNED_AND_VALID) {
        return resultOk(claimedAuthor);
    }

    // TODO: Translation
    const error = verified === VERIFICATION_STATUS.SIGNED_AND_INVALID
        ? `Verification of ${signatureType} signature failed`
        : `Missing ${signatureType} signature`;
    return resultError({
        claimedAuthor: claimedAuthor,
        error,
    });    
}

/**
 * Convert an array of 8-bit integers to a hex string
 * @param bytes - Array of 8-bit integers to convert
 * @returns Hexadecimal representation of the array
 */
export const arrayToHexString = (bytes: Uint8Array) => {
    const hexAlphabet = '0123456789abcdef';
    let s = '';
    bytes.forEach((v) => {
        s += hexAlphabet[v >> 4] + hexAlphabet[v & 15];
    });
    return s;
};
