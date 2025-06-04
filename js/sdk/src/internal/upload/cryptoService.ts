import { c } from "ttag";

import { DriveCrypto, PrivateKey, SessionKey } from "../../crypto";
import { IntegrityError } from "../../errors";
import { Thumbnail } from "../../interface";
import { EncryptedBlock, EncryptedThumbnail, NodeCrypto, NodeRevisionDraftKeys, NodesService } from "./interface";

export class UploadCryptoService {
    constructor(
        private driveCrypto: DriveCrypto,
        private nodesService: NodesService,
    ) {
        this.driveCrypto = driveCrypto;
        this.nodesService = nodesService;
    }

    async generateFileCrypto(
        parentUid: string,
        parentKeys: { key: PrivateKey, hashKey: Uint8Array },
        name: string,
    ): Promise<NodeCrypto> {
        const signatureAddress = await this.nodesService.getRootNodeEmailKey(parentUid);

        const [
            nodeKeys,
            { armoredNodeName },
            hash,
        ] = await Promise.all([
            this.driveCrypto.generateKey([parentKeys.key], signatureAddress.addressKey),
            this.driveCrypto.encryptNodeName(name, undefined, parentKeys.key, signatureAddress.addressKey),
            this.driveCrypto.generateLookupHash(name, parentKeys.hashKey),
        ]);

        const contentKey = await this.driveCrypto.generateContentKey(nodeKeys.decrypted.key);

        return {
            nodeKeys,
            contentKey,
            encryptedNode: {
                encryptedName: armoredNodeName,
                hash,
            },
            signatureAddress,
        };
    }

    async generateNameHashes(parentHashKey: Uint8Array, names: string[]): Promise<{ name: string, hash: string }[]> {
        return Promise.all(names.map(async (name) => ({
            name,
            hash: await this.driveCrypto.generateLookupHash(name, parentHashKey)
        })));
    }

    async encryptThumbnail(nodeRevisionDraftKeys: NodeRevisionDraftKeys, thumbnail: Thumbnail): Promise<EncryptedThumbnail> {
        const { encryptedData } = await this.driveCrypto.encryptThumbnailBlock(
            thumbnail.thumbnail,
            nodeRevisionDraftKeys.contentKeyPacketSessionKey,
            nodeRevisionDraftKeys.signatureAddress.addressKey,
        )

        const digest = await crypto.subtle.digest('SHA-256', encryptedData);

        return {
            type: thumbnail.type,
            encryptedData: encryptedData,
            originalSize: thumbnail.thumbnail.length,
            encryptedSize: encryptedData.length,
            hash: new Uint8Array(digest),
        }
    }

    async encryptBlock(
        verifyBlock: (encryptedBlock: Uint8Array) => Promise<{ verificationToken: Uint8Array }>,
        nodeRevisionDraftKeys: NodeRevisionDraftKeys,
        block: Uint8Array,
        index: number,
    ): Promise<EncryptedBlock> {
        const { encryptedData, armoredSignature } = await this.driveCrypto.encryptBlock(
            block,
            nodeRevisionDraftKeys.key,
            nodeRevisionDraftKeys.contentKeyPacketSessionKey,
            nodeRevisionDraftKeys.signatureAddress.addressKey,
        );

        const digest = await crypto.subtle.digest('SHA-256', encryptedData);
        const { verificationToken } = await verifyBlock(encryptedData);

        return {
            index,
            encryptedData,
            armoredSignature,
            verificationToken,
            originalSize: block.length,
            encryptedSize: encryptedData.length,
            hash: new Uint8Array(digest),
        }
    }

    async commitFile(nodeRevisionDraftKeys: NodeRevisionDraftKeys, manifest: Uint8Array, extendedAttributes?: string): Promise<{
        armoredManifestSignature: string,
        signatureEmail: string,
        armoredExtendedAttributes?: string,
    }> {
        const { armoredManifestSignature } = await this.driveCrypto.signManifest(manifest, nodeRevisionDraftKeys.signatureAddress.addressKey);

        const { armoredExtendedAttributes } = extendedAttributes
            ? await this.driveCrypto.encryptExtendedAttributes(extendedAttributes, nodeRevisionDraftKeys.key, nodeRevisionDraftKeys.signatureAddress.addressKey)
            : { armoredExtendedAttributes: undefined };

        return {
            armoredManifestSignature,
            signatureEmail: nodeRevisionDraftKeys.signatureAddress.email,
            armoredExtendedAttributes,
        }
    }

    async getContentKeyPacketSessionKey(nodeKey: PrivateKey, base64ContentKeyPacket: string): Promise<SessionKey> {
        const { sessionKey } = await this.driveCrypto.decryptAndVerifySessionKey(
            base64ContentKeyPacket,
            undefined,
            nodeKey,
            [],
        );
        return sessionKey;
    }

    async verifyBlock(
        nodeKey: PrivateKey,
        contentKeyPacketSessionKey: SessionKey,
        verificationCode: Uint8Array,
        encryptedData: Uint8Array,
    ): Promise<{
        verificationToken: Uint8Array,
    }> {
        // Attempt to decrypt data block, to try to detect bitflips / bad hardware
        //
        // We don't check the signature as it is an expensive operation,
        // and we don't need to here as we always have the manifest signature
        //
        // Additionally, we use the key provided by the verification endpoint, to
        // ensure the correct key was used to encrypt the data
        try {
            await this.driveCrypto.decryptBlock(
                encryptedData,
                undefined,
                nodeKey,
                contentKeyPacketSessionKey,
            );
        } catch (error) {
            throw new IntegrityError(c('Error').t`Data integrity check of one part failed`, {
                error,
            });
        }

        // The verifier requires a 0-padded data packet, so we can
        // access the array directly and fall back to 0.
        const verificationToken = verificationCode.map((value, index) => value ^ (encryptedData[index] || 0));
        return {
            verificationToken,
        }
    }
}
