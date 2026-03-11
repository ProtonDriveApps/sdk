import { PrivateKey, SessionKey } from '../../crypto';
import { AbortError, IntegrityError } from '../../errors';
import { Logger, Thumbnail, ThumbnailType, UploadMetadata } from '../../interface';
import { getErrorMessage } from '../errors';
import { generateFileExtendedAttributes } from '../nodes';
import { UploadAPIService } from './apiService';
import { BlockVerifier, verifyBlockWithContentKey } from './blockVerifier';
import { UploadCryptoService } from './cryptoService';
import { UploadDigests } from './digests';
import { Uploader } from './fileUploader';
import { NodeRevisionDraft, NodeCrypto } from './interface';
import { UploadManager } from './manager';
import { readStreamToUint8Array } from './streamReader';
import { MAX_BLOCK_ENCRYPTION_RETRIES } from './streamUploader';
import { UploadTelemetry } from './telemetry';

export type NodeKeys = {
    key: PrivateKey;
    contentKeyPacket: Uint8Array<ArrayBuffer>;
    contentKeyPacketSessionKey: SessionKey;
    signingKeys: NodeCrypto['signingKeys'];
};

/**
 * Base uploader for small file and small revision uploads.
 * Shares the single-request flow: read content, get node crypto, encrypt, then call API.
 */
abstract class SmallUploader extends Uploader {
    protected logger: Logger;

    constructor(
        telemetry: UploadTelemetry,
        apiService: UploadAPIService,
        cryptoService: UploadCryptoService,
        manager: UploadManager,
        metadata: UploadMetadata,
        onFinish: () => void,
        signal: AbortSignal | undefined,
    ) {
        super(telemetry, apiService, cryptoService, manager, metadata, onFinish, signal);
        this.logger = telemetry.getLoggerForSmallUpload();
    }
    protected async createRevisionDraft(): Promise<{
        revisionDraft: NodeRevisionDraft;
        blockVerifier: BlockVerifier;
    }> {
        throw new Error('Small upload does not use revision draft');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async deleteRevisionDraft(revisionDraft: NodeRevisionDraft): Promise<void> {
        throw new Error('Small upload does not use revision draft');
    }

    protected async startUpload(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<{ nodeRevisionUid: string; nodeUid: string }> {
        try {
            const result = await this.handleUpload(stream, thumbnails);

            onProgress?.(this.metadata.expectedSize);
            void this.telemetry.uploadFinished(result.nodeRevisionUid, this.metadata.expectedSize);
            return result;
        } catch (error) {
            void this.telemetry.uploadInitFailed(this.getTelemetryContextUid(), error, this.metadata.expectedSize);
            throw error;
        } finally {
            this.onFinish();
        }
    }

    protected abstract getTelemetryContextUid(): string;

    protected abstract handleUpload(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
    ): Promise<{
        nodeUid: string;
        nodeRevisionUid: string;
    }>;

    protected async buildPayloads(
        nodeKeys: NodeKeys,
        stream: ReadableStream,
        thumbnails: Thumbnail[],
    ): Promise<{
        commitPayload: {
            armoredManifestSignature: string;
            armoredExtendedAttributes: string;
        };
        encryptedBlock:
            | {
                  encryptedData: Uint8Array<ArrayBuffer>;
                  armoredSignature: string;
                  verificationToken: Uint8Array<ArrayBuffer>;
              }
            | undefined;
        encryptedThumbnails: { type: ThumbnailType; encryptedData: Uint8Array<ArrayBuffer> }[];
    }> {
        const content = await this.readStreamContent(stream);

        const [encryptedThumbnails, encryptedBlock] = await Promise.all([
            this.encryptThumbnails(nodeKeys, thumbnails),
            this.encryptContentBlock(nodeKeys, content.data),
        ]);
        const commitPayload = await this.encryptCommitPayload(nodeKeys, content.sha1, encryptedBlock);

        return {
            commitPayload,
            encryptedBlock,
            encryptedThumbnails,
        };
    }

    private async readStreamContent(stream: ReadableStream): Promise<{
        data: Uint8Array<ArrayBuffer>;
        sha1: string;
    }> {
        const content = await readStreamToUint8Array(stream, this.abortController.signal);

        if (content.length !== this.metadata.expectedSize) {
            throw new IntegrityError(new Error('Stream size does not match expected size').message, {
                actual: content.length,
                expected: this.metadata.expectedSize,
            });
        }

        const digests = new UploadDigests();
        digests.update(content);
        const contentSha1 = digests.digests().sha1;

        if (this.metadata.expectedSha1 && contentSha1 !== this.metadata.expectedSha1) {
            throw new IntegrityError(new Error('File hash does not match expected hash').message, {
                uploadedSha1: contentSha1,
                expectedSha1: this.metadata.expectedSha1,
            });
        }

        return {
            data: content,
            sha1: contentSha1,
        };
    }

    private async encryptThumbnails(
        nodeKeys: NodeKeys,
        thumbnails: Thumbnail[],
    ): Promise<{ type: ThumbnailType; encryptedData: Uint8Array<ArrayBuffer> }[]> {
        const result = [];
        for (const thumbnail of thumbnails) {
            this.logger.debug(`Encrypting thumbnail ${thumbnail.type}`);
            const enc = await this.cryptoService.encryptThumbnail(nodeKeys, thumbnail);
            result.push({ type: thumbnail.type, encryptedData: enc.encryptedData });
        }
        return result;
    }

    private async encryptContentBlock(
        nodeKeys: NodeKeys,
        content: Uint8Array<ArrayBuffer>,
    ): Promise<
        | {
              encryptedData: Uint8Array<ArrayBuffer>;
              armoredSignature: string;
              verificationToken: Uint8Array<ArrayBuffer>;
              blockHash: Uint8Array<ArrayBuffer>;
          }
        | undefined
    > {
        this.logger.debug(`Encrypting block`);

        if (content.length === 0) {
            return;
        }

        let attempt = 0;
        let integrityError = false;
        let encrypted;
        while (!encrypted) {
            attempt++;
            try {
                encrypted = await this.cryptoService.encryptBlock(
                    (encryptedBlock) =>
                        verifyBlockWithContentKey(
                            this.cryptoService,
                            nodeKeys.contentKeyPacket,
                            nodeKeys.contentKeyPacketSessionKey,
                            encryptedBlock,
                        ),
                    nodeKeys,
                    content,
                    0,
                );
                if (integrityError) {
                    void this.telemetry.logBlockVerificationError(true);
                }
            } catch (error: unknown) {
                // Do not retry or report anything if the upload was aborted.
                if (error instanceof AbortError) {
                    throw error;
                }

                if (error instanceof IntegrityError) {
                    integrityError = true;
                }

                if (attempt <= MAX_BLOCK_ENCRYPTION_RETRIES) {
                    this.logger.warn(`Block encryption failed #${attempt}, retrying: ${getErrorMessage(error)}`);
                    continue;
                }

                this.logger.error(`Failed to encrypt block`, error);
                if (integrityError) {
                    void this.telemetry.logBlockVerificationError(false);
                }
                throw error;
            }
        }

        const blockHash = await encrypted.hashPromise;
        return {
            encryptedData: encrypted.encryptedData,
            armoredSignature: encrypted.armoredSignature,
            verificationToken: encrypted.verificationToken,
            blockHash,
        };
    }

    private async encryptCommitPayload(
        nodeKeys: NodeKeys,
        contentSha1: string,
        encryptedBlock:
            | {
                  blockHash: Uint8Array<ArrayBuffer>;
              }
            | undefined,
    ): Promise<{
        armoredManifestSignature: string;
        armoredExtendedAttributes: string;
    }> {
        this.logger.debug(`Preparing commit payload`);

        const manifest = encryptedBlock ? encryptedBlock.blockHash : new Uint8Array(0);
        const extendedAttributes = generateFileExtendedAttributes(
            {
                modificationTime: this.metadata.modificationTime,
                size: this.metadata.expectedSize,
                blockSizes: this.metadata.expectedSize > 0 ? [this.metadata.expectedSize] : [],
                digests: { sha1: contentSha1 },
            },
            this.metadata.additionalMetadata,
        );
        const commitCrypto = await this.cryptoService.commitFile(nodeKeys, manifest, extendedAttributes);
        return {
            armoredManifestSignature: commitCrypto.armoredManifestSignature,
            armoredExtendedAttributes: commitCrypto.armoredExtendedAttributes,
        };
    }
}

/**
 * Uploader for small new files using the single-request small file endpoint.
 */
export class SmallFileUploader extends SmallUploader {
    constructor(
        telemetry: UploadTelemetry,
        apiService: UploadAPIService,
        cryptoService: UploadCryptoService,
        manager: UploadManager,
        metadata: UploadMetadata,
        onFinish: () => void,
        signal: AbortSignal | undefined,
        private parentFolderUid: string,
        private name: string,
    ) {
        super(telemetry, apiService, cryptoService, manager, metadata, onFinish, signal);
        this.parentFolderUid = parentFolderUid;
        this.name = name;
    }

    protected getTelemetryContextUid(): string {
        return this.parentFolderUid;
    }

    protected async handleUpload(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
    ): Promise<{
        nodeUid: string;
        nodeRevisionUid: string;
    }> {
        const nodeCrypto = await this.manager.generateNewFileCrypto(this.parentFolderUid, this.name);
        const nodeKeys = {
            key: nodeCrypto.nodeKeys.decrypted.key,
            contentKeyPacket: nodeCrypto.contentKey.encrypted.contentKeyPacket,
            contentKeyPacketSessionKey: nodeCrypto.contentKey.decrypted.contentKeyPacketSessionKey,
            signingKeys: nodeCrypto.signingKeys,
        };
        const payloads = await this.buildPayloads(nodeKeys, stream, thumbnails);
        return this.manager.uploadFile(
            this.parentFolderUid,
            nodeCrypto,
            this.metadata,
            payloads.commitPayload,
            payloads.encryptedBlock,
            payloads.encryptedThumbnails,
        );
    }
}

/**
 * Uploader for small new revisions using the single-request small revision endpoint.
 * Reuses the existing file's keys.
 */
export class SmallFileRevisionUploader extends SmallUploader {
    constructor(
        telemetry: UploadTelemetry,
        apiService: UploadAPIService,
        cryptoService: UploadCryptoService,
        manager: UploadManager,
        metadata: UploadMetadata,
        onFinish: () => void,
        signal: AbortSignal | undefined,
        private nodeUid: string,
    ) {
        super(telemetry, apiService, cryptoService, manager, metadata, onFinish, signal);
        this.nodeUid = nodeUid;
    }

    protected getTelemetryContextUid(): string {
        return this.nodeUid;
    }

    protected async handleUpload(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
    ): Promise<{
        nodeUid: string;
        nodeRevisionUid: string;
    }> {
        const nodeKeys = await this.manager.getExistingFileNodeCrypto(this.nodeUid);
        const payloads = await this.buildPayloads(nodeKeys, stream, thumbnails);
        return this.manager.uploadSmallRevision(
            this.nodeUid,
            nodeKeys,
            payloads.commitPayload,
            payloads.encryptedBlock,
            payloads.encryptedThumbnails,
        );
    }
}
