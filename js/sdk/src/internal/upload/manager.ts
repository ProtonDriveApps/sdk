import { c } from 'ttag';

import { Logger, ProtonDriveTelemetry, UploadMetadata } from '../../interface';
import { ValidationError, NodeWithSameNameExistsValidationError } from '../../errors';
import { ErrorCode } from '../apiService';
import { generateFileExtendedAttributes } from '../nodes';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';
import { NodeRevisionDraft, NodesService, NodeCrypto } from './interface';
import { makeNodeUid, splitNodeUid } from '../uids';

/**
 * UploadManager is responsible for creating and deleting draft nodes
 * on the server. It handles the creation of draft nodes, including
 * generating the necessary cryptographic keys and metadata.
 */
export class UploadManager {
    protected logger: Logger;

    constructor(
        telemetry: ProtonDriveTelemetry,
        protected apiService: UploadAPIService,
        protected cryptoService: UploadCryptoService,
        protected nodesService: NodesService,
        protected clientUid: string | undefined,
    ) {
        this.logger = telemetry.getLogger('upload');
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.nodesService = nodesService;
        this.clientUid = clientUid;
    }

    async createDraftNode(parentFolderUid: string, name: string, metadata: UploadMetadata): Promise<NodeRevisionDraft> {
        const parentKeys = await this.nodesService.getNodeKeys(parentFolderUid);
        if (!parentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Creating files in non-folders is not allowed`);
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
            parentNodeKeys: {
                hashKey: parentKeys.hashKey,
            },
            newNodeInfo: {
                parentUid: parentFolderUid,
                name,
                encryptedName: generatedNodeCrypto.encryptedNode.encryptedName,
                hash: generatedNodeCrypto.encryptedNode.hash,
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
        nodeUid: string;
        nodeRevisionUid: string;
    }> {
        try {
            const result = await this.apiService.createDraft(parentFolderUid, {
                armoredEncryptedName: generatedNodeCrypto.encryptedNode.encryptedName,
                hash: generatedNodeCrypto.encryptedNode.hash,
                mediaType: metadata.mediaType,
                intendedUploadSize: metadata.expectedSize,
                armoredNodeKey: generatedNodeCrypto.nodeKeys.encrypted.armoredKey,
                armoredNodePassphrase: generatedNodeCrypto.nodeKeys.encrypted.armoredPassphrase,
                armoredNodePassphraseSignature: generatedNodeCrypto.nodeKeys.encrypted.armoredPassphraseSignature,
                base64ContentKeyPacket: generatedNodeCrypto.contentKey.encrypted.base64ContentKeyPacket,
                armoredContentKeyPacketSignature:
                    generatedNodeCrypto.contentKey.encrypted.armoredContentKeyPacketSignature,
                signatureEmail: generatedNodeCrypto.signatureAddress.email,
            });
            return result;
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                if (error.code === ErrorCode.ALREADY_EXISTS) {
                    this.logger.info(`Node with given name already exists`);

                    const typedDetails = error.details as
                        | {
                              ConflictLinkID: string;
                              ConflictRevisionID?: string;
                              ConflictDraftRevisionID?: string;
                              ConflictDraftClientUID?: string;
                          }
                        | undefined;

                    // If the client doesn't specify the client UID, it should
                    // never be considered own draft.
                    const isOwnDraftConflict =
                        typedDetails?.ConflictDraftRevisionID &&
                        this.clientUid &&
                        typedDetails?.ConflictDraftClientUID === this.clientUid;

                    // If there is existing draft created by this client,
                    // automatically delete it and try to create a new one
                    // with the same name again.
                    if (
                        typedDetails?.ConflictDraftRevisionID &&
                        (isOwnDraftConflict || metadata.overrideExistingDraftByOtherClient)
                    ) {
                        const existingDraftNodeUid = makeNodeUid(
                            splitNodeUid(parentFolderUid).volumeId,
                            typedDetails.ConflictLinkID,
                        );

                        let deleteFailed = false;
                        try {
                            this.logger.warn(
                                `Deleting existing draft node ${existingDraftNodeUid} by ${typedDetails.ConflictDraftClientUID}`,
                            );
                            await this.apiService.deleteDraft(existingDraftNodeUid);
                        } catch (deleteDraftError: unknown) {
                            // Do not throw, let throw the conflict error.
                            deleteFailed = true;
                            this.logger.error('Failed to delete existing draft node', deleteDraftError);
                        }
                        if (!deleteFailed) {
                            return this.createDraftOnAPI(
                                parentFolderUid,
                                parentHashKey,
                                name,
                                metadata,
                                generatedNodeCrypto,
                            );
                        }
                    }

                    if (isOwnDraftConflict) {
                        this.logger.warn(
                            `Existing draft conflict by another client ${typedDetails.ConflictDraftClientUID}`,
                        );
                    }

                    const existingNodeUid = typedDetails
                        ? makeNodeUid(splitNodeUid(parentFolderUid).volumeId, typedDetails.ConflictLinkID)
                        : undefined;

                    throw new NodeWithSameNameExistsValidationError(
                        error.message,
                        error.code,
                        existingNodeUid,
                        !!typedDetails?.ConflictDraftRevisionID,
                    );
                }
            }
            throw error;
        }
    }

    async findAvailableName(parentFolderUid: string, name: string): Promise<string> {
        const { hashKey: parentHashKey } = await this.nodesService.getNodeKeys(parentFolderUid);
        if (!parentHashKey) {
            throw new ValidationError(c('Error').t`Creating files in non-folders is not allowed`);
        }

        const [namePart, extension] = splitExtension(name);

        const batchSize = 10;
        let startIndex = 1;
        while (true) {
            const namesToCheck = [];
            for (let i = startIndex; i < startIndex + batchSize; i++) {
                namesToCheck.push(joinNameAndExtension(namePart, i, extension));
            }

            const hashesToCheck = await this.cryptoService.generateNameHashes(parentHashKey, namesToCheck);

            const { availalbleHashes } = await this.apiService.checkAvailableHashes(
                parentFolderUid,
                hashesToCheck.map(({ hash }) => hash),
            );

            if (!availalbleHashes.length) {
                startIndex += batchSize;
                continue;
            }

            const availableHash = hashesToCheck.find(({ hash }) => hash === availalbleHashes[0]);
            if (!availableHash) {
                throw Error('Backend returned unexpected hash');
            }

            return availableHash.name;
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

    async createDraftRevision(nodeUid: string, metadata: UploadMetadata): Promise<NodeRevisionDraft> {
        const node = await this.nodesService.getNode(nodeUid);
        const nodeKeys = await this.nodesService.getNodeKeys(nodeUid);

        if (!node.activeRevision?.ok || !nodeKeys.contentKeyPacketSessionKey) {
            throw new ValidationError(c('Error').t`Creating revisions in non-files is not allowed`);
        }

        const signatureAddress = await this.nodesService.getRootNodeEmailKey(nodeUid);

        const { nodeRevisionUid } = await this.apiService.createDraftRevision(nodeUid, {
            currentRevisionUid: node.activeRevision.value.uid,
            intendedUploadSize: metadata.expectedSize,
        });

        return {
            nodeUid,
            nodeRevisionUid,
            nodeKeys: {
                key: nodeKeys.key,
                contentKeyPacketSessionKey: nodeKeys.contentKeyPacketSessionKey,
                signatureAddress: signatureAddress,
            },
        };
    }

    async deleteDraftRevision(nodeRevisionUid: string): Promise<void> {
        try {
            await this.apiService.deleteDraftRevision(nodeRevisionUid);
        } catch (error: unknown) {
            // Only log the error but do not fail the operation as we are
            // deleting draft only when somethign fails and original error
            // will bubble up.
            this.logger.error('Failed to delete draft node revision', error);
        }
    }

    async commitDraft(
        nodeRevisionDraft: NodeRevisionDraft,
        manifest: Uint8Array,
        extendedAttributes: {
            modificationTime?: Date;
            size: number;
            blockSizes: number[];
            digests: {
                sha1: string;
            };
        },
        additionalExtendedAttributes?: object,
    ): Promise<void> {
        const generatedExtendedAttributes = generateFileExtendedAttributes(
            extendedAttributes,
            additionalExtendedAttributes,
        );
        const nodeCommitCrypto = await this.cryptoService.commitFile(
            nodeRevisionDraft.nodeKeys,
            manifest,
            generatedExtendedAttributes,
        );
        await this.apiService.commitDraftRevision(nodeRevisionDraft.nodeRevisionUid, nodeCommitCrypto);
        await this.notifyNodeUploaded(nodeRevisionDraft);
    }

    protected async notifyNodeUploaded(nodeRevisionDraft: NodeRevisionDraft): Promise<void> {
        // If new revision to existing node was created, invalidate the node.
        // Otherwise notify about the new child in the parent.
        if (nodeRevisionDraft.newNodeInfo) {
            await this.nodesService.notifyChildCreated(nodeRevisionDraft.newNodeInfo.parentUid);
        } else {
            await this.nodesService.notifyNodeChanged(nodeRevisionDraft.nodeUid);
        }
    }
}

/**
 * Split a filename into `[name, extension]`
 */
function splitExtension(filename = ''): [string, string] {
    const endIdx = filename.lastIndexOf('.');
    if (endIdx === -1 || endIdx === filename.length - 1) {
        return [filename, ''];
    }
    return [filename.slice(0, endIdx), filename.slice(endIdx + 1)];
}

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
