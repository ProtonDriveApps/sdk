import { c } from "ttag";

import { Logger, ProtonDriveTelemetry, UploadMetadata } from "../../interface";
import { ValidationError, NodeAlreadyExistsValidationError } from "../../errors";
import { UploadAPIService } from "./apiService";
import { UploadCryptoService } from "./cryptoService";
import { NodeRevisionDraft, NodesService, NodeCrypto } from "./interface";
import { ErrorCode } from "../apiService";

/**
 * UploadManager is responsible for creating and deleting draft nodes
 * on the server. It handles the creation of draft nodes, including
 * generating the necessary cryptographic keys and metadata.
 */
export class UploadManager {
    private logger: Logger;

    constructor(
        telemetry: ProtonDriveTelemetry,
        private apiService: UploadAPIService,
        private cryptoService: UploadCryptoService,
        private nodesService: NodesService,
    ) {
        this.logger = telemetry.getLogger('upload');
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.nodesService = nodesService;
    }

    async createDraftNode(parentFolderUid: string, name: string, metadata: UploadMetadata): Promise<NodeRevisionDraft> {
        const parentKeys = await this.nodesService.getNodeKeys(parentFolderUid);
        if (!parentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Creating folders in non-folders is not allowed`);
        }

        const generatedNodeCrypto = await this.cryptoService.generateFileCrypto(
            parentFolderUid,
            { key: parentKeys.key, hashKey: parentKeys.hashKey },
            name,
        );

        const { nodeUid, nodeRevisionUid } = await this.createDraftOnAPI(
            parentFolderUid,
            parentKeys.hashKey,
            name,
            metadata,
            generatedNodeCrypto,
        );

        return {
            nodeUid,
            nodeRevisionUid,
            nodeKeys: {
                key: generatedNodeCrypto.nodeKeys.decrypted.key,
                contentKeyPacketSessionKey: generatedNodeCrypto.contentKey.decrypted.contentKeyPacketSessionKey,
                signatureAddress: generatedNodeCrypto.signatureAddress,
            },
        };
    }

    private async createDraftOnAPI(
        parentFolderUid: string,
        parentHashKey: Uint8Array,
        name: string,
        metadata: UploadMetadata,
        generatedNodeCrypto: NodeCrypto,
    ): Promise<{
        nodeUid: string,
        nodeRevisionUid: string,
    }> {
        try {
            const result = await this.apiService.createDraft(parentFolderUid, {
                armoredEncryptedName: generatedNodeCrypto.encryptedNode.encryptedName,
                hash: generatedNodeCrypto.encryptedNode.hash,
                mimeType: metadata.mimeType,
                intendedUploadSize: metadata.expectedSize,
                armoredNodeKey: generatedNodeCrypto.nodeKeys.encrypted.armoredKey,
                armoredNodePassphrase: generatedNodeCrypto.nodeKeys.encrypted.armoredPassphrase,
                armoredNodePassphraseSignature: generatedNodeCrypto.nodeKeys.encrypted.armoredPassphraseSignature,
                base64ContentKeyPacket: generatedNodeCrypto.contentKey.encrypted.base64ContentKeyPacket,
                armoredContentKeyPacketSignature: generatedNodeCrypto.contentKey.encrypted.armoredContentKeyPacketSignature,
                signatureEmail: generatedNodeCrypto.signatureAddress.email,
                // TODO: client UID
            });
            return result;
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                if (error.code === ErrorCode.ALREADY_EXISTS) {
                    this.logger.info(`Node with given name already exists`);
                    const availableName = await this.findAvailableName(
                        parentFolderUid,
                        parentHashKey,
                        name,
                        generatedNodeCrypto.encryptedNode.hash,
                    );

                    // If there is existing draft created by this client,
                    // automatically delete it and try to create a new one
                    // with the same name again.
                    if (availableName.existingDraftNodeUid) {
                        let deleteFailed = false;
                        try {
                            this.logger.warn(`Deleting existing draft node ${availableName.existingDraftNodeUid}`);
                            await this.apiService.deleteDraft(availableName.existingDraftNodeUid);
                        } catch (deleteDraftError: unknown) {
                            // Do not throw, let return the next available name to the client.
                            deleteFailed = true;
                            this.logger.error('Failed to delete existing draft node', deleteDraftError);
                        }
                        if (!deleteFailed) {
                            return this.createDraftOnAPI(parentFolderUid, parentHashKey, name, metadata, generatedNodeCrypto);
                        }
                    }

                    // If there is existing node, return special error
                    // that includes the available name the client can use.
                    throw new NodeAlreadyExistsValidationError(
                        error.message,
                        error.code,
                        availableName.availableName,
                    );
                }
            }
            throw error;
        }
    }

    private async findAvailableName(parentFolderUid: string, parentHashKey: Uint8Array, name: string, nameHash: string): Promise<{
        availableName: string,
        existingDraftNodeUid?: string,
    }> {
        const [namePart, extension] = splitExtension(name);

        const batchSize = 10;
        let startIndex = 1;
        while (true) {
            const namesToCheck = [];
            for (let i = startIndex; i < startIndex + batchSize; i++) {
                namesToCheck.push(joinNameAndExtension(namePart, i, extension));
            }

            const hashesToCheck = await this.cryptoService.generateNameHashes(parentHashKey, namesToCheck);

            const { pendingHashes, availalbleHashes } = await this.apiService.checkAvailableHashes(
                parentFolderUid,
                [
                    ...hashesToCheck.map(({ hash }) => hash),
                    // Adding the current name hash to get the existing draft
                    // node UID if it exists.
                    ...startIndex ? [nameHash] : [],
                ],
            );

            if (!availalbleHashes.length) {
                startIndex += batchSize;
                continue;
            }

            const availableHash = hashesToCheck.find(({ hash }) => hash === availalbleHashes[0]);
            if (!availableHash) {
                throw Error('Backend returned unexpected hash');
            }

            // TODO: use client UID to ensure its own pending draft
            const ownPendingHash = pendingHashes.find(({ hash }) => hash === nameHash);
            return {
                availableName: availableHash.name,
                existingDraftNodeUid: ownPendingHash?.nodeUid,
            }
        }
    }

    async deleteDraftNode(nodeUid: string): Promise<void> {
        try {
            await this.apiService.deleteDraft(nodeUid);
        } catch (error: unknown) {
            // Only log the error but do not fail the operation as we are
            // deleting draft only when somethign fails and original error
            // will bubble up.
            this.logger.error('Failed to delete draft node', error);
        }
    }
}

/**
 * Split a filename into `[name, extension]`
 */
function splitExtension(filename = ''): [string, string] {
    const endIdx = filename.lastIndexOf('.');
    if (endIdx === -1 || endIdx === filename.length-1) {
        return [filename, ''];
    }
    return [filename.slice(0, endIdx), filename.slice(endIdx + 1)];
};

/**
 * Join a filename into `name (index).extension`
 */
function joinNameAndExtension(name: string, index: number, extension: string): string {
    if (!name && !extension) {
        return `(${index})`;
    }
    if (!name) {
        return `(${index}).${extension}`;
    }
    if (!extension) {
        return `${name} (${index})`;
    }
    return `${name} (${index}).${extension}`;
}
