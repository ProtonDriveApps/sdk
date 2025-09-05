import { DriveCrypto, PrivateKey } from '../../crypto';
import { resultOk, resultError, Result } from '../../interface';
import { getErrorMessage } from '../errors';
import { EncryptedShareCrypto, EncryptedNode, DecryptedNode, DecryptedNodeKeys } from './interface';

/**
 * Provides crypto operations for public link data.
 *
 * The public link crypto service is responsible for decrypting and encrypting
 * public link data. It should export high-level actions only, such as "decrypt
 * share key" instead of low-level operations like "decrypt key". Low-level
 * operations should be kept private to the module.
 */
export class SharingPublicCryptoService {
    constructor(
        private driveCrypto: DriveCrypto,
        private password: string,
    ) {
        this.driveCrypto = driveCrypto;
        this.password = password;
    }

    async decryptShareKey(encryptedShare: EncryptedShareCrypto): Promise<PrivateKey> {
        const { key: shareKey } = await this.driveCrypto.decryptKeyWithSrpPassword(
            this.password,
            encryptedShare.base64UrlPasswordSalt,
            encryptedShare.armoredKey,
            encryptedShare.armoredPassphrase,
        );
        return shareKey;
    }

    // TODO: verfiy it has all needed
    async decryptNode(
        node: EncryptedNode,
        parentKey: PrivateKey,
    ): Promise<{ node: DecryptedNode; keys?: DecryptedNodeKeys }> {
        const commonNodeMetadata = {
            ...node,
            encryptedCrypto: undefined,
        };

        const { name } = await this.decryptName(node, parentKey);

        let passphrase, key, passphraseSessionKey;
        try {
            const keyResult = await this.decryptKey(node, parentKey);
            passphrase = keyResult.passphrase;
            key = keyResult.key;
            passphraseSessionKey = keyResult.passphraseSessionKey;
        } catch (error: unknown) {
            return {
                node: {
                    ...commonNodeMetadata,
                    name,
                    errors: [error],
                },
            };
        }

        const errors = [];

        let hashKey;
        if ('folder' in node.encryptedCrypto) {
            try {
                const hashKeyResult = await this.decryptHashKey(node, key);
                hashKey = hashKeyResult.hashKey;
            } catch (error: unknown) {
                errors.push(error);
            }
        }

        let contentKeyPacketSessionKey;
        if ('file' in node.encryptedCrypto) {
            try {
                const keySessionKeyResult = await this.driveCrypto.decryptAndVerifySessionKey(
                    node.encryptedCrypto.file.base64ContentKeyPacket,
                    '',
                    key,
                    [],
                );

                contentKeyPacketSessionKey = keySessionKeyResult.sessionKey;
            } catch (error: unknown) {
                errors.push(error);
            }
        }

        return {
            node: {
                ...commonNodeMetadata,
                name,
                errors: errors.length ? errors : undefined,
            },
            keys: {
                passphrase,
                key,
                passphraseSessionKey,
                contentKeyPacketSessionKey,
                hashKey,
            },
        };
    }

    private async decryptKey(node: EncryptedNode, parentKey: PrivateKey): Promise<DecryptedNodeKeys> {
        const key = await this.driveCrypto.decryptKey(
            node.encryptedCrypto.armoredKey,
            node.encryptedCrypto.armoredNodePassphrase,
            '',
            [parentKey],
            [],
        );

        return {
            passphrase: key.passphrase,
            key: key.key,
            passphraseSessionKey: key.passphraseSessionKey,
        };
    }

    private async decryptName(
        node: EncryptedNode,
        parentKey: PrivateKey,
    ): Promise<{
        name: Result<string, Error>;
    }> {
        try {
            const { name } = await this.driveCrypto.decryptNodeName(node.encryptedName, parentKey, []);

            return {
                name: resultOk(name),
            };
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            return {
                name: resultError(new Error(errorMessage)),
            };
        }
    }

    private async decryptHashKey(
        node: EncryptedNode,
        nodeKey: PrivateKey,
    ): Promise<{
        hashKey: Uint8Array;
    }> {
        if (!('folder' in node.encryptedCrypto)) {
            // This is developer error.
            throw new Error('Node is not a folder');
        }

        const { hashKey } = await this.driveCrypto.decryptNodeHashKey(
            node.encryptedCrypto.folder.armoredHashKey,
            nodeKey,
            [],
        );

        return {
            hashKey,
        };
    }
}
