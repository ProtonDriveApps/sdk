import { c } from 'ttag';
import { DriveCrypto, PrivateKey, SessionKey } from '../../crypto';
import { ValidationError } from '../../errors';
import { InvalidNameError, Result } from '../../interface';
import { DecryptedNodeKeys, NodeSigningKeys } from '../nodes/interface';

/**
 * Provides crypto operations for albums.
 *
 * Albums are special folders in the photos volume. This service reuses
 * the drive crypto module for key and name encryption operations.
 */
export class AlbumsCryptoService {
    constructor(private driveCrypto: DriveCrypto) {
        this.driveCrypto = driveCrypto;
    }

    async createAlbum(
        parentKeys: { key: PrivateKey; hashKey: Uint8Array<ArrayBuffer> },
        signingKeys: NodeSigningKeys,
        name: string,
    ): Promise<{
        encryptedCrypto: {
            encryptedName: string;
            hash: string;
            armoredKey: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature: string;
            signatureEmail: string;
            armoredHashKey: string;
        };
        keys: DecryptedNodeKeys;
    }> {
        if (signingKeys.type !== 'userAddress') {
            throw new Error('Creating album by anonymous user is not supported');
        }
        const email = signingKeys.email;
        const nameAndPassphraseSigningKey = signingKeys.key;

        const [nodeKeys, { armoredNodeName }, hash] = await Promise.all([
            this.driveCrypto.generateKey([parentKeys.key], nameAndPassphraseSigningKey),
            this.driveCrypto.encryptNodeName(name, undefined, parentKeys.key, nameAndPassphraseSigningKey),
            this.driveCrypto.generateLookupHash(name, parentKeys.hashKey),
        ]);

        const { armoredHashKey, hashKey } = await this.driveCrypto.generateHashKey(nodeKeys.decrypted.key);

        return {
            encryptedCrypto: {
                encryptedName: armoredNodeName,
                hash,
                armoredKey: nodeKeys.encrypted.armoredKey,
                armoredNodePassphrase: nodeKeys.encrypted.armoredPassphrase,
                armoredNodePassphraseSignature: nodeKeys.encrypted.armoredPassphraseSignature,
                signatureEmail: email,
                armoredHashKey,
            },
            keys: {
                passphrase: nodeKeys.decrypted.passphrase,
                key: nodeKeys.decrypted.key,
                passphraseSessionKey: nodeKeys.decrypted.passphraseSessionKey,
                hashKey,
            },
        };
    }

    async renameAlbum(
        parentKeys: { key: PrivateKey; hashKey?: Uint8Array<ArrayBuffer> },
        encryptedName: string,
        signingKeys: NodeSigningKeys,
        newName: string,
    ): Promise<{
        signatureEmail: string;
        armoredNodeName: string;
        hash: string;
    }> {
        if (!parentKeys.hashKey) {
            throw new Error('Cannot rename album: parent folder hash key not available');
        }
        if (signingKeys.type !== 'userAddress') {
            throw new Error('Renaming album by anonymous user is not supported');
        }
        const email = signingKeys.email;
        const nameSigningKey = signingKeys.key;

        const nodeNameSessionKey = await this.driveCrypto.decryptSessionKey(encryptedName, parentKeys.key);

        const { armoredNodeName } = await this.driveCrypto.encryptNodeName(
            newName,
            nodeNameSessionKey,
            parentKeys.key,
            nameSigningKey,
        );

        const hash = await this.driveCrypto.generateLookupHash(newName, parentKeys.hashKey);

        return {
            signatureEmail: email,
            armoredNodeName,
            hash,
        };
    }

    async encryptPhotoForAlbum(
        nodeName: Result<string, Error | InvalidNameError>,
        sha1: string,
        nodeKeys: { passphrase: string; passphraseSessionKey: SessionKey; nameSessionKey: SessionKey },
        albumKeys: { key: PrivateKey; hashKey: Uint8Array<ArrayBuffer> },
        signingKeys: NodeSigningKeys,
    ): Promise<{
        encryptedName: string;
        hash: string;
        contentHash: string;
        armoredNodePassphrase: string;
        armoredNodePassphraseSignature: string;
        signatureEmail: string;
        nameSignatureEmail: string;
    }> {
        if (!nodeName.ok) {
            throw new ValidationError(c('Error').t`Cannot add photo to album without a valid name`);
        }
        if (signingKeys.type !== 'userAddress') {
            throw new Error('Adding photos to album by anonymous user is not supported');
        }
        const email = signingKeys.email;
        const signingKey = signingKeys.key;

        const [{ armoredNodeName }, hash, contentHash, { armoredPassphrase, armoredPassphraseSignature }] =
            await Promise.all([
                this.driveCrypto.encryptNodeName(nodeName.value, nodeKeys.nameSessionKey, albumKeys.key, signingKey),
                this.driveCrypto.generateLookupHash(nodeName.value, albumKeys.hashKey),
                this.driveCrypto.generateLookupHash(sha1, albumKeys.hashKey),
                this.driveCrypto.encryptPassphrase(
                    nodeKeys.passphrase,
                    nodeKeys.passphraseSessionKey,
                    [albumKeys.key],
                    signingKey,
                ),
            ]);

        return {
            encryptedName: armoredNodeName,
            hash,
            contentHash,
            armoredNodePassphrase: armoredPassphrase,
            armoredNodePassphraseSignature: armoredPassphraseSignature,
            signatureEmail: email,
            nameSignatureEmail: email,
        };
    }
}
