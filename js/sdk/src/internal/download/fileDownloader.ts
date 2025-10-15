import { c } from 'ttag';

import { PrivateKey, SessionKey, base64StringToUint8Array } from '../../crypto';
import { AbortError } from '../../errors';
import { Logger } from '../../interface';
import { LoggerWithPrefix } from '../../telemetry';
import { APIHTTPError, HTTPErrorCode } from '../apiService';
import { DecryptedRevision } from '../nodes';
import { DownloadAPIService } from './apiService';
import { getBlockIndex } from './blockIndex';
import { DownloadController } from './controller';
import { DownloadCryptoService } from './cryptoService';
import { BlockMetadata, RevisionKeys } from './interface';
import { BufferedSeekableStream } from './seekableStream';
import { DownloadTelemetry } from './telemetry';

/**
 * Maximum number of blocks that can be downloaded at the same time
 * for a single file. This is to prevent downloading too many blocks
 * at the same time and running out of memory.
 */
const MAX_DOWNLOAD_BLOCK_SIZE = 10;

export class FileDownloader {
    private logger: Logger;

    private controller: DownloadController;
    private nextBlockIndex = 1;
    private ongoingDownloads = new Map<
        number,
        {
            downloadPromise: Promise<void>;
            decryptedBufferedBlock?: Uint8Array;
        }
    >();

    constructor(
        private telemetry: DownloadTelemetry,
        private apiService: DownloadAPIService,
        private cryptoService: DownloadCryptoService,
        private nodeKey: { key: PrivateKey; contentKeyPacketSessionKey: SessionKey },
        private revision: DecryptedRevision,
        private signal?: AbortSignal,
        private onFinish?: () => void,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLoggerForRevision(revision.uid);
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.nodeKey = nodeKey;
        this.revision = revision;
        this.signal = signal;
        this.onFinish = onFinish;
        this.controller = new DownloadController(this.signal);
    }

    getClaimedSizeInBytes(): number | undefined {
        return this.revision.claimedSize;
    }

    getSeekableStream(): BufferedSeekableStream {
        let position = 0;
        let cryptoKeys: RevisionKeys;

        const logger = new LoggerWithPrefix(this.logger, `seekable stream`);

        const claimedBlockSizes = this.revision.claimedBlockSizes;
        if (!claimedBlockSizes) {
            // Old nodes will not have claimed block sizes. One option is to
            // use default block size, but old clients didn't use the same
            // size (4 MiB vs 4 MB, for example).
            // Ideally, we should throw error that client can easily handle,
            // at the same time, new nodes shouldn't have this issue.
            // For now, we throw general error that client must handle as any
            // error from download - do not support seeking and ask user to
            // download the whole file instead.
            // In the future, we might either change this error, or have some
            // clever way to detect block sizes from the first block and work
            // around this issue.
            throw new Error('Revision does not have defined claimed block sizes');
        }

        const stream = new BufferedSeekableStream({
            start: async () => {
                logger.debug(`Starting`);
                cryptoKeys = await this.cryptoService.getRevisionKeys(this.nodeKey, this.revision);
            },
            pull: async (controller) => {
                logger.debug(`Pulling at position ${position}`);

                const result = await this.downloadDataFromPosition(claimedBlockSizes, position, cryptoKeys);
                if (result instanceof Error) {
                    logger.error('Download failed', result);
                    controller.error(result);
                    return;
                }
                if (!result) {
                    logger.debug(`Download finished at position ${position}`);
                    controller.close();
                    return;
                }
                controller.enqueue(result);
                position += result.length;
            },
            cancel: (reason?: unknown) => {
                logger.info(`Cancelled: ${reason}`);
                this.onFinish?.();
            },
            seek: async (newPosition) => {
                logger.info(`Seeking to position ${newPosition}`);
                position = newPosition;
            },
        });
        return stream;
    }

    private async downloadDataFromPosition(
        claimedBlockSizes: number[],
        position: number,
        cryptoKeys: RevisionKeys,
    ): Promise<Uint8Array | Error | undefined> {
        const { value, done } = getBlockIndex(claimedBlockSizes, position);
        if (done) {
            return;
        }

        this.logger.info(`Downloading data from block ${value.blockIndex} at offset ${value.blockOffset}`);

        try {
            const { blockIndex, blockOffset } = value;
            const blockMetadata = await this.apiService.getRevisionBlockToken(
                this.revision.uid,
                blockIndex,
                this.signal,
            );

            const blockData = await this.downloadBlockData(blockMetadata, true, cryptoKeys);
            return blockData.slice(blockOffset);
        } catch (error: unknown) {
            return error instanceof Error ? error : new Error(`Unknown error: ${error}`, { cause: error });
        }
    }

    downloadToStream(stream: WritableStream, onProgress?: (downloadedBytes: number) => void): DownloadController {
        if (this.controller.promise) {
            throw new Error(`Download already started`);
        }
        this.controller.promise = this.internalDownloadToStream(stream, onProgress);
        return this.controller;
    }

    unsafeDownloadToStream(stream: WritableStream, onProgress?: (downloadedBytes: number) => void): DownloadController {
        if (this.controller.promise) {
            throw new Error(`Download already started`);
        }
        const ignoreIntegrityErrors = true;
        this.controller.promise = this.internalDownloadToStream(stream, onProgress, ignoreIntegrityErrors);
        return this.controller;
    }

    private async internalDownloadToStream(
        stream: WritableStream,
        onProgress?: (downloadedBytes: number) => void,
        ignoreIntegrityErrors = false,
    ): Promise<void> {
        const writer = stream.getWriter();
        const cryptoKeys = await this.cryptoService.getRevisionKeys(this.nodeKey, this.revision);

        // File progress is tracked for telemetry - to track at what
        // point the download failed.
        let fileProgress = 0;

        // Collection of all block hashes for manifest verification.
        // This includes both thumbnail and regular blocks.
        const allBlockHashes: Uint8Array[] = [];
        let armoredManifestSignature: string | undefined;

        try {
            this.logger.info(`Starting download`);
            for await (const blockMetadata of this.apiService.iterateRevisionBlocks(this.revision.uid, this.signal)) {
                if (blockMetadata.type === 'manifestSignature') {
                    armoredManifestSignature = blockMetadata.armoredManifestSignature;
                    continue;
                }

                allBlockHashes.push(base64StringToUint8Array(blockMetadata.base64sha256Hash));
                if (blockMetadata.type === 'thumbnail') {
                    continue;
                }

                await this.controller.waitWhilePaused();

                const downloadPromise = this.downloadBlock(
                    blockMetadata,
                    ignoreIntegrityErrors,
                    cryptoKeys,
                    (downloadedBytes) => {
                        fileProgress += downloadedBytes;
                        onProgress?.(fileProgress);
                    },
                );
                this.ongoingDownloads.set(blockMetadata.index, { downloadPromise });

                await this.waitForDownloadCapacity();
                await this.flushCompletedBlocks(async (chunk) => {
                    await writer.write(chunk);
                });
            }

            this.logger.debug(`All blocks downloading, waiting for them to finish`);
            await Promise.all(this.downloadPromises);
            await this.flushCompletedBlocks(async (chunk) => {
                await writer.write(chunk);
            });

            if (this.ongoingDownloads.size > 0) {
                this.logger.error(`Some blocks were not downloaded: ${this.ongoingDownloads.keys()}`);
                // This is a bug in the algorithm.
                throw new Error(`Some blocks were not downloaded`);
            }

            if (ignoreIntegrityErrors) {
                this.logger.warn('Skipping manifest check');
            } else {
                this.logger.debug(`Verifying manifest`);
                await this.cryptoService.verifyManifest(
                    this.revision,
                    this.nodeKey.key,
                    allBlockHashes,
                    armoredManifestSignature,
                );
            }

            await writer.close();
            void this.telemetry.downloadFinished(this.revision.uid, fileProgress);
            this.logger.info(`Download succeeded`);
        } catch (error: unknown) {
            this.logger.error(`Download failed`, error);
            void this.telemetry.downloadFailed(this.revision.uid, error, fileProgress, this.getClaimedSizeInBytes());
            await writer.abort();
            throw error;
        } finally {
            this.logger.debug(`Download cleanup`);
            this.onFinish?.();
        }
    }

    private async downloadBlock(
        blockMetadata: BlockMetadata,
        ignoreIntegrityErrors: boolean,
        cryptoKeys: RevisionKeys,
        onProgress: (downloadedBytes: number) => void,
    ) {
        const blockData = await this.downloadBlockData(blockMetadata, ignoreIntegrityErrors, cryptoKeys, onProgress);
        this.ongoingDownloads.get(blockMetadata.index)!.decryptedBufferedBlock = blockData;
    }

    private async downloadBlockData(
        blockMetadata: BlockMetadata,
        ignoreIntegrityErrors: boolean,
        cryptoKeys: RevisionKeys,
        onProgress?: (downloadedBytes: number) => void,
    ): Promise<Uint8Array> {
        const logger = new LoggerWithPrefix(this.logger, `block ${blockMetadata.index}`);
        logger.info(`Download started`);

        let blockProgress = 0;
        let decryptedBlock: Uint8Array | null = null;
        let retries = 0;

        while (!decryptedBlock) {
            logger.debug(`Downloading`);
            await this.controller.waitWhilePaused();
            try {
                const encryptedBlock = await this.apiService.downloadBlock(
                    blockMetadata.bareUrl,
                    blockMetadata.token,
                    (downloadedBytes) => {
                        blockProgress += downloadedBytes;
                        onProgress?.(downloadedBytes);
                    },
                    this.signal,
                );

                if (ignoreIntegrityErrors) {
                    logger.warn('Skipping hash check');
                } else {
                    logger.debug(`Verifying hash`);
                    await this.cryptoService.verifyBlockIntegrity(encryptedBlock, blockMetadata.base64sha256Hash);
                }

                logger.debug(`Decrypting`);
                decryptedBlock = await this.cryptoService.decryptBlock(encryptedBlock, cryptoKeys);
            } catch (error) {
                if (this.signal?.aborted) {
                    throw new AbortError(c('Error').t`Operation aborted`);
                }

                if (blockProgress !== 0) {
                    onProgress?.(-blockProgress);
                    blockProgress = 0;
                }

                if (error instanceof APIHTTPError && error.statusCode === HTTPErrorCode.NOT_FOUND) {
                    logger.warn(`Token expired, fetching new token and retrying`);
                    blockMetadata = await this.apiService.getRevisionBlockToken(
                        this.revision.uid,
                        blockMetadata.index,
                        this.signal,
                    );
                    continue;
                }

                // Download can fail for various reasons, for example integrity
                // can fail due to bitflips. We want to retry and solve the issue
                // seamlessly for the user. We retry only once, because we don't
                // want to get stuck in a loop.
                if (retries === 0) {
                    logger.error(`Download failed, retrying`, error);
                    retries++;
                    continue;
                }

                logger.error(`Download failed`, error);
                throw error;
            }
        }

        logger.info(`Downloaded`);
        return decryptedBlock;
    }

    private async waitForDownloadCapacity() {
        if (this.ongoingDownloads.size >= MAX_DOWNLOAD_BLOCK_SIZE) {
            this.logger.info(`Download limit reached, waiting for next block to be finished`);

            // We need to ensure the next block is downloaded, otherwise the
            // buffer will still be full.
            while (!this.isNextBlockDownloaded) {
                // Promise.race never finishes if the passed array is empty.
                // It shouldn't happen if at least next block is still not downloaded,
                // also JS is single threaded, so it should be impossible to change
                // the ongoing downloads in the middle of the loop. It is handled
                // just in case something is changed that would affect this part
                // without noticing.
                const ongoingDownloadPromises = Array.from(this.ongoingDownloadPromises);
                if (ongoingDownloadPromises.length === 0) {
                    break;
                }

                // Promise.race is used to ensure if any block fails, the error is
                // thrown up the chain and we dont end up in stuck loop here waiting
                // for the next block to be ready.
                // We wait only for the ongoing downloads as if we use all promises,
                // some block can be finished and it would result in inifinite loop.
                await Promise.race(ongoingDownloadPromises);
            }
        }
    }

    private async flushCompletedBlocks(write: (chunk: Uint8Array) => void | Promise<void>) {
        this.logger.debug(`Flushing completed blocks`);
        while (this.isNextBlockDownloaded) {
            const decryptedBlock = this.ongoingDownloads.get(this.nextBlockIndex)!.decryptedBufferedBlock!;
            this.logger.info(`Flushing completed block ${this.nextBlockIndex}`);
            try {
                await write(decryptedBlock);
            } catch (error) {
                this.logger.error(`Failed to write block, retrying once`, error);
                await write(decryptedBlock);
            }
            this.ongoingDownloads.delete(this.nextBlockIndex);
            this.nextBlockIndex++;
        }
    }

    private get downloadPromises() {
        return this.ongoingDownloads.values().map(({ downloadPromise }) => downloadPromise);
    }

    private get ongoingDownloadPromises() {
        return this.ongoingDownloads
            .values()
            .filter((value) => value.decryptedBufferedBlock === undefined)
            .map((value) => value.downloadPromise);
    }

    private get isNextBlockDownloaded() {
        return !!this.ongoingDownloads.get(this.nextBlockIndex)?.decryptedBufferedBlock;
    }
}
