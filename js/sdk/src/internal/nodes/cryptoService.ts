import { c } from 'ttag';

import { DriveCrypto, PrivateKey, PublicKey, SessionKey, VERIFICATION_STATUS } from "../../crypto";
import { resultOk, resultError, Result, Author, AnonymousUser, ProtonDriveAccount, ProtonDriveTelemetry, Logger, MetricsDecryptionErrorField, MetricVerificationErrorField } from "../../interface";
import { ValidationError } from '../../errors';
import { getErrorMessage, getVerificationMessage } from "../errors";
import { splitNodeUid } from "../uids";
import { EncryptedNode, EncryptedNodeFolderCrypto, DecryptedUnparsedNode, DecryptedNode, DecryptedNodeKeys, SharesService, EncryptedRevision, DecryptedUnparsedRevision } from "./interface";

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
    private logger: Logger;

    private reportedDecryptionErrors = new Set<string>();
    private reportedVerificationErrors = new Set<string>();

    constructor(
        private telemetry: ProtonDriveTelemetry,
        private driveCrypto: DriveCrypto,
        private account: ProtonDriveAccount,
        private shareService: SharesService,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('nodes-crypto');
        this.driveCrypto = driveCrypto;
        this.account = account;
        this.shareService = shareService;
    }

    async decryptNode(node: EncryptedNode, parentKey: PrivateKey): Promise<{ node: DecryptedUnparsedNode, keys?: DecryptedNodeKeys }> {
        const commonNodeMetadata = {
            ...node,
            encryptedCrypto: undefined,
        }

        const signatureEmailKeys = node.encryptedCrypto.signatureEmail
            ? await this.account.getPublicKeys(node.encryptedCrypto.signatureEmail)
            : [];

        // Parent key is node or share key. Anonymous files are signed with
        // the node parent key. If the anonymous file is shared directly,
        // there is no access to the parent key. In that case, the verification
        // is skipped.
        const nodeParentKeys = node.parentUid ? [parentKey] : [];

        // Anonymous uploads (without signature email set) use parent key instead.
        const keyVerificationKeys = node.encryptedCrypto.signatureEmail
            ? signatureEmailKeys
            : nodeParentKeys;

        let nameVerificationKeys;
        const nameSignatureEmail = node.encryptedCrypto.nameSignatureEmail;
        if (nameSignatureEmail === node.encryptedCrypto.signatureEmail) {
            nameVerificationKeys = keyVerificationKeys;
        } else {
            nameVerificationKeys = nameSignatureEmail
                ? await this.account.getPublicKeys(nameSignatureEmail)
                : nodeParentKeys;
        }

        const { name, author: nameAuthor } = await this.decryptName(node, parentKey, nameVerificationKeys);

        let passphrase, key, passphraseSessionKey, keyAuthor;
        try {
            const keyResult = await this.decryptKey(node, parentKey, keyVerificationKeys);
            passphrase = keyResult.passphrase;
            key = keyResult.key;
            passphraseSessionKey = keyResult.passphraseSessionKey;
            keyAuthor = keyResult.author;
        } catch (error: unknown) {
            void this.reportDecryptionError(node, 'nodeKey', error);
            const message = getErrorMessage(error);
            const errorMessage = c('Error').t`Failed to decrypt node key: ${message}`;
            return {
                node: {
                    ...commonNodeMetadata,
                    name,
                    keyAuthor: resultError({
                        claimedAuthor: node.encryptedCrypto.signatureEmail,
                        error: errorMessage,
                    }),
                    nameAuthor,
                    activeRevision: "file" in node.encryptedCrypto
                        ? resultError(new Error(errorMessage))
                        : undefined,
                    folder: undefined,
                    errors: [error],
                },
            }
        }

        const errors = [];

        let hashKey;
        let hashKeyAuthor;
        let folder;
        let folderExtendedAttributesAuthor;
        if ("folder" in node.encryptedCrypto) {
            try {
                const hashKeyResult = await this.decryptHashKey(node, key, signatureEmailKeys);
                hashKey = hashKeyResult.hashKey;
                hashKeyAuthor = hashKeyResult.author;
            } catch (error: unknown) {
                void this.reportDecryptionError(node, 'nodeHashKey', error);
                errors.push(error);
            }

            try {
                const folderExtendedAttributesVerificationKeys = node.encryptedCrypto.signatureEmail
                    ? signatureEmailKeys
                    : [key];
                const extendedAttributesResult = await this.decryptExtendedAttributes(
                    node,
                    node.encryptedCrypto.folder.armoredExtendedAttributes,
                    key,
                    folderExtendedAttributesVerificationKeys,
                    node.encryptedCrypto.signatureEmail
                );
                folder = {
                    extendedAttributes: extendedAttributesResult.extendedAttributes,
                };
                folderExtendedAttributesAuthor = extendedAttributesResult.author;
            } catch (error: unknown) {
                void this.reportDecryptionError(node, 'nodeExtendedAttributes', error);
                errors.push(error);
            }
        }

        let activeRevision: Result<DecryptedUnparsedRevision, Error> | undefined;
        let contentKeyPacketSessionKey;
        let contentKeyPacketAuthor;
        if ("file" in node.encryptedCrypto) {
            try {
                activeRevision = resultOk(await this.decryptRevision(node.uid, node.encryptedCrypto.activeRevision, key));
            } catch (error: unknown) {
                void this.reportDecryptionError(node, 'nodeExtendedAttributes', error);
                const message = getErrorMessage(error);
                const errorMessage = c('Error').t`Failed to decrypt active revision: ${message}`;
                activeRevision = resultError(new Error(errorMessage));
            }

            try {
                const keySessionKeyResult = await this.driveCrypto.decryptAndVerifySessionKey(
                    node.encryptedCrypto.file.base64ContentKeyPacket,
                    node.encryptedCrypto.file.armoredContentKeyPacketSignature,
                    key,
                    // Content key packet is signed with the node key, but
                    // in the past some clients signed with the address key.
                    [key, ...keyVerificationKeys],
                );

                contentKeyPacketSessionKey = keySessionKeyResult.sessionKey;
                contentKeyPacketAuthor = keySessionKeyResult.verified && await this.handleClaimedAuthor(
                    node,
                    'nodeContentKey',
                    c('Property').t`content key`,
                    keySessionKeyResult.verified,
                    node.encryptedCrypto.signatureEmail,
                );
            } catch (error: unknown) {
                void this.reportDecryptionError(node, 'nodeContentKey', error);
                const message = getErrorMessage(error);
                const errorMessage = c('Error').t`Failed to decrypt content key: ${message}`;
                contentKeyPacketAuthor = resultError({
                    claimedAuthor: node.encryptedCrypto.signatureEmail,
                    error: errorMessage,
                });
                errors.push(error);
            }
        }

        // If key signature verificaiton failed, prefer returning error from
        // the key directly. If key signature is ok but not hash or folder
        // extended attributes, return that error instead. Only if all the
        // signatures using the same signature email are ok, return OK.
        let finalKeyAuthor;
        if (!keyAuthor.ok) {
            finalKeyAuthor = keyAuthor;
        }
        if (!finalKeyAuthor && contentKeyPacketAuthor && !contentKeyPacketAuthor.ok) {
            finalKeyAuthor = contentKeyPacketAuthor;
        }
        if (!finalKeyAuthor && hashKeyAuthor && !hashKeyAuthor.ok) {
            finalKeyAuthor = hashKeyAuthor;
        }
        if (!finalKeyAuthor && folderExtendedAttributesAuthor && !folderExtendedAttributesAuthor.ok) {
            finalKeyAuthor = folderExtendedAttributesAuthor;
        }
        if (!finalKeyAuthor) {
            finalKeyAuthor = keyAuthor;
        }

        return {
            node: {
                ...commonNodeMetadata,
                name,
                keyAuthor: finalKeyAuthor,
                nameAuthor,
                activeRevision,
                folder,
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
    };

    private async decryptKey(node: EncryptedNode, parentKey: PrivateKey, verificationKeys: PublicKey[]): Promise<DecryptedNodeKeys & {
        author: Author,
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
            passphraseSessionKey: key.passphraseSessionKey,
            author: await this.handleClaimedAuthor(node, 'nodeKey', c('Property').t`key`, key.verified, node.encryptedCrypto.signatureEmail, verificationKeys.length === 0),
        };
    };

    private async decryptName(node: EncryptedNode, parentKey: PrivateKey, verificationKeys: PublicKey[]): Promise<{
        name: Result<string, Error>,
        author: Author,
    }> {
        const nameSignatureEmail = node.encryptedCrypto.nameSignatureEmail;

        try {
            const { name, verified } = await this.driveCrypto.decryptNodeName(
                node.encryptedName,
                parentKey,
                verificationKeys,
            );

            return {
                name: resultOk(name),
                author: await this.handleClaimedAuthor(node, 'nodeName', c('Property').t`name`, verified, nameSignatureEmail, verificationKeys.length === 0),
            }
        } catch (error: unknown) {
            void this.reportDecryptionError(node, 'nodeName', error);
            const errorMessage = getErrorMessage(error);
            return {
                name: resultError(new Error(errorMessage)),
                author: resultError({
                    claimedAuthor: nameSignatureEmail,
                    error: errorMessage,
                }),
            }
        }
    };

    async getNameSessionKey(node: { encryptedName: string }, parentKey: PrivateKey): Promise<SessionKey> {
        return this.driveCrypto.decryptSessionKey(node.encryptedName, parentKey);
    }

    private async decryptHashKey(node: EncryptedNode, nodeKey: PrivateKey, addressKeys: PublicKey[]): Promise<{
        hashKey: Uint8Array,
        author: Author,
    }> {
        if (!("folder" in node.encryptedCrypto)) {
            // This is developer error.
            throw new Error('Node is not a folder');
        }

        const { hashKey, verified } = await this.driveCrypto.decryptNodeHashKey(
            node.encryptedCrypto.folder.armoredHashKey,
            nodeKey,
            addressKeys,
        );

        return {
            hashKey,
            author: await this.handleClaimedAuthor(node, 'nodeHashKey', c('Property').t`hash key`, verified, node.encryptedCrypto.signatureEmail),
        }
    }

    async decryptRevision(nodeUid: string, encryptedRevision: EncryptedRevision, nodeKey: PrivateKey): Promise<DecryptedUnparsedRevision> {
        const verificationKeys = encryptedRevision.signatureEmail
            ? await this.account.getPublicKeys(encryptedRevision.signatureEmail)
            : [nodeKey];

        const {
            extendedAttributes,
            author: contentAuthor,
        } = await this.decryptExtendedAttributes(
            { uid: nodeUid, creationTime: encryptedRevision.creationTime },
            encryptedRevision.armoredExtendedAttributes,
            nodeKey,
            verificationKeys,
            encryptedRevision.signatureEmail,
        );

        return {
            uid: encryptedRevision.uid,
            state: encryptedRevision.state,
            creationTime: encryptedRevision.creationTime,
            storageSize: encryptedRevision.storageSize,
            contentAuthor,
            extendedAttributes,
            thumbnails: encryptedRevision.thumbnails,
        }
    }

    private async decryptExtendedAttributes(
        node: { uid: string, creationTime: Date },
        encryptedExtendedAttributes: string | undefined,
        nodeKey: PrivateKey,
        addressKeys: PublicKey[],
        signatureEmail?: string,
    ): Promise<{
        extendedAttributes?: string,
        author: Author,
    }> {
        if (!encryptedExtendedAttributes) {
            return {
                author: resultOk(signatureEmail) as Author,
            }
        }

        const { extendedAttributes, verified } = await this.driveCrypto.decryptExtendedAttributes(
            encryptedExtendedAttributes,
            nodeKey,
            addressKeys,
        );

        return {
            extendedAttributes,
            author: await this.handleClaimedAuthor(node, "nodeExtendedAttributes", c('Property').t`attributes`, verified, signatureEmail),
        }
    }

    async createFolder(
        parentKeys: { key: PrivateKey, hashKey: Uint8Array },
        address: { email: string, addressKey: PrivateKey },
        name: string,
        extendedAttributes?: string,
    ): Promise<{
        encryptedCrypto: Required<EncryptedNodeFolderCrypto> & { encryptedName: string, hash: string },
        keys: DecryptedNodeKeys,
    }> {
        const { email, addressKey } = address;
        const [
            nodeKeys,
            { armoredNodeName },
            hash,
        ] = await Promise.all([
            this.driveCrypto.generateKey([parentKeys.key], addressKey),
            this.driveCrypto.encryptNodeName(name, undefined, parentKeys.key, addressKey),
            this.driveCrypto.generateLookupHash(name, parentKeys.hashKey),
        ]);

        const { armoredHashKey, hashKey } = await this.driveCrypto.generateHashKey(nodeKeys.decrypted.key);

        const { armoredExtendedAttributes } = extendedAttributes
            ? await this.driveCrypto.encryptExtendedAttributes(extendedAttributes, nodeKeys.decrypted.key, addressKey)
            : { armoredExtendedAttributes: undefined };

        return {
            encryptedCrypto: {
                encryptedName: armoredNodeName,
                hash,
                armoredKey: nodeKeys.encrypted.armoredKey,
                armoredNodePassphrase: nodeKeys.encrypted.armoredPassphrase,
                armoredNodePassphraseSignature: nodeKeys.encrypted.armoredPassphraseSignature,
                folder: {
                    armoredExtendedAttributes: armoredExtendedAttributes,
                    armoredHashKey,
                },
                signatureEmail: email,
                nameSignatureEmail: email,
            },
            keys: {
                passphrase: nodeKeys.decrypted.passphrase,
                key: nodeKeys.decrypted.key,
                passphraseSessionKey: nodeKeys.decrypted.passphraseSessionKey,
                hashKey,
            },
        };
    }

    async encryptNewName(
        parentKeys: { key: PrivateKey, hashKey?: Uint8Array },
        nodeNameSessionKey: SessionKey,
        address: { email: string, addressKey: PrivateKey },
        newName: string,
    ): Promise<{
        signatureEmail: string,
        armoredNodeName: string,
        hash?: string,
    }> {
        const { email, addressKey } = address;

        const { armoredNodeName } = await this.driveCrypto.encryptNodeName(newName, nodeNameSessionKey, parentKeys.key, addressKey);

        const hash = parentKeys.hashKey
            ? await this.driveCrypto.generateLookupHash(newName, parentKeys.hashKey)
            : undefined;
        return {
            signatureEmail: email,
            armoredNodeName,
            hash,
        };
    };

    async moveNode(
        node: DecryptedNode,
        keys: { passphrase: string, passphraseSessionKey: SessionKey, nameSessionKey: SessionKey },
        parentKeys: { key: PrivateKey, hashKey: Uint8Array },
        address: { email: string, addressKey: PrivateKey },
    ): Promise<{
        encryptedName: string,
        hash: string,
        armoredNodePassphrase: string,
        armoredNodePassphraseSignature: string,
        signatureEmail: string,
        nameSignatureEmail: string,
    }> {
        if (!parentKeys.hashKey) {
            throw new ValidationError('Moving item to a non-folder is not allowed');
        }
        if (!node.name.ok) {
            throw new ValidationError('Cannot move item without a valid name, please rename the item first');
        }

        const { email, addressKey } = address;
        const { armoredNodeName } = await this.driveCrypto.encryptNodeName(node.name.value, keys.nameSessionKey, parentKeys.key, addressKey);
        const hash = await this.driveCrypto.generateLookupHash(node.name.value, parentKeys.hashKey);
        const { armoredPassphrase, armoredPassphraseSignature } = await this.driveCrypto.encryptPassphrase(keys.passphrase, keys.passphraseSessionKey, [parentKeys.key], addressKey);

        return {
            encryptedName: armoredNodeName,
            hash,
            armoredNodePassphrase: armoredPassphrase,
            armoredNodePassphraseSignature: armoredPassphraseSignature,
            signatureEmail: email,
            nameSignatureEmail: email,
        };
    }

    private async handleClaimedAuthor(
        node: { uid: string, creationTime: Date },
        field: MetricVerificationErrorField,
        signatureType: string,
        verified: VERIFICATION_STATUS,
        claimedAuthor?: string,
        notAvailableVerificationKeys = false,
    ): Promise<Author> {
        const author = handleClaimedAuthor(signatureType, verified, claimedAuthor, notAvailableVerificationKeys);
        if (!author.ok) {
            void this.reportVerificationError(node, field, claimedAuthor);
        }
        return author;
    }

    private async reportVerificationError(
        node: { uid: string, creationTime: Date },
        field: MetricVerificationErrorField,
        claimedAuthor?: string,
    ) {
        if (this.reportedVerificationErrors.has(node.uid)) {
            return;
        }

        const fromBefore2024 = node.creationTime < new Date('2024-01-01');

        let addressMatchingDefaultShare, volumeType;
        try {
            const { volumeId } = splitNodeUid(node.uid);
            const { email } = await this.shareService.getMyFilesShareMemberEmailKey();
            addressMatchingDefaultShare = claimedAuthor ? claimedAuthor === email : undefined;
            volumeType = await this.shareService.getVolumeMetricContext(volumeId);
        } catch (error: unknown) {
            this.logger.error('Failed to check if claimed author matches default share', error);
        }

        this.logger.warn(`Failed to verify ${field} for node ${node.uid} (from before 2024: ${fromBefore2024}, matching address: ${addressMatchingDefaultShare})`);

        this.telemetry.logEvent({
            eventName: 'verificationError',
            volumeType,
            field,
            addressMatchingDefaultShare,
            fromBefore2024,
        });
        this.reportedVerificationErrors.add(node.uid);
    }

    private async reportDecryptionError(node: EncryptedNode, field: MetricsDecryptionErrorField, error: unknown) {
        if (this.reportedDecryptionErrors.has(node.uid)) {
            return;
        }

        const fromBefore2024 = node.creationTime < new Date('2024-01-01');

        let volumeType;
        try {
            const { volumeId } = splitNodeUid(node.uid);
            volumeType = await this.shareService.getVolumeMetricContext(volumeId);
        } catch (error: unknown) {
            this.logger.error('Failed to get metric context', error);
        }

        this.logger.error(`Failed to decrypt node ${node.uid} (from before 2024: ${fromBefore2024})`, error);

        this.telemetry.logEvent({
            eventName: 'decryptionError',
            volumeType,
            field,
            fromBefore2024,
            error,
        });
        this.reportedDecryptionErrors.add(node.uid);
    }
}

/**
 * @param signatureType - Must be translated before calling this function.
 */
function handleClaimedAuthor(signatureType: string, verified: VERIFICATION_STATUS, claimedAuthor?: string, notAvailableVerificationKeys = false): Author {
    if (!claimedAuthor && notAvailableVerificationKeys) {
        return resultOk(null as AnonymousUser);
    }

    if (verified === VERIFICATION_STATUS.SIGNED_AND_VALID) {
        return resultOk(claimedAuthor || (null as AnonymousUser));
    }

    return resultError({
        claimedAuthor: claimedAuthor,
        error: getVerificationMessage(verified, signatureType, notAvailableVerificationKeys),
    });
}
