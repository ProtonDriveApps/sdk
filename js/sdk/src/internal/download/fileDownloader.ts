import { PrivateKey, SessionKey, base64StringToUint8Array } from "../../crypto";
import { Logger, Revision } from "../../interface";
import { LoggerWithPrefix } from "../../telemetry";
import { APIHTTPError, HTTPErrorCode } from '../apiService';
import { DownloadAPIService } from "./apiService";
import { DownloadController } from './controller';
import { DownloadCryptoService } from "./cryptoService";
import { BlockMetadata, RevisionKeys } from './interface';
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
    private ongoingDownloads = new Map<number, {
        downloadPromise: Promise<void>,
        decryptedBufferedBlock?: Uint8Array,
    }>();

    constructor(
        private telemetry: DownloadTelemetry,
        private apiService: DownloadAPIService,
        private cryptoService: DownloadCryptoService,
        private nodeKey: { key: PrivateKey, contentKeyPacketSessionKey: SessionKey },
        private revision: Revision,
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
        this.controller = new DownloadController();
    }

    getClaimedSizeInBytes(): number | undefined {
        return this.revision.claimedSize;
    }

    writeToStream(stream: WritableStream, onProgress?: (downloadedBytes: number) => void): DownloadController {
        if (this.controller.promise) {
            throw new Error(`Download already started`);
        }
        this.controller.promise = this.downloadToStream(stream, onProgress);
        return this.controller;
    }

    unsafeWriteToStream(stream: WritableStream, onProgress?: (downloadedBytes: number) => void): DownloadController {
        if (this.controller.promise) {
            throw new Error(`Download already started`);
        }
        const ignoreIntegrityErrors = true;
        this.controller.promise = this.downloadToStream(stream, onProgress, ignoreIntegrityErrors);
        return this.controller;
    }

    private async downloadToStream(
        stream: WritableStream,
        onProgress?: (writtenBytes: number) => void,
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
                        onProgress?.(downloadedBytes);
                    },
                );
                this.ongoingDownloads.set(blockMetadata.index, { downloadPromise });

                await this.waitForDownloadCapacity();
                await this.flushCompletedBlocks(writer);
            }

            this.logger.debug(`All blocks downloading, waiting for them to finish`);
            await Promise.all(this.downloadPromises);
            await this.flushCompletedBlocks(writer);

            if (this.ongoingDownloads.size > 0) {
                this.logger.error(`Some blocks were not downloaded: ${this.ongoingDownloads.keys()}`);
                // This is a bug in the algorithm.
                throw new Error(`Some blocks were not downloaded`);
            }

            if (ignoreIntegrityErrors) {
                this.logger.warn('Skipping manifest check');
            } else {
                this.logger.debug(`Verifying manifest`);
                await this.cryptoService.verifyManifest(this.revision, this.nodeKey.key, allBlockHashes, armoredManifestSignature);
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
        const logger = new LoggerWithPrefix(this.logger, `block ${blockMetadata.index}`);
        logger.info(`Download started`);

        let blockProgress = 0;
        let decryptedBlock: Uint8Array | null = null;
        let retries = 0;

        while (!decryptedBlock) {
            logger.debug(`Downloading`);
            await this.controller.waitWhilePaused();
            try {
                const encryptedBlock = await this.apiService.downloadBlock(blockMetadata.bareUrl, blockMetadata.token, (downloadedBytes) => {
                    blockProgress += downloadedBytes;
                    onProgress?.(downloadedBytes);
                }, this.signal);

                if (ignoreIntegrityErrors) {
                    logger.warn('Skipping hash check');
                } else {
                    logger.debug(`Verifying hash`);
                    await this.cryptoService.verifyBlockIntegrity(encryptedBlock, blockMetadata.base64sha256Hash);
                }

                logger.debug(`Decrypting`);
                decryptedBlock = await this.cryptoService.decryptBlock(encryptedBlock, blockMetadata.armoredSignature!, cryptoKeys);
            } catch (error) {
                if (blockProgress !== 0) {
                    onProgress?.(-blockProgress);
                    blockProgress = 0;
                }

                if (error instanceof APIHTTPError && error.statusCode === HTTPErrorCode.NOT_FOUND) {
                    logger.warn(`Token expired, fetching new token and retrying`);
                    blockMetadata = await this.apiService.getRevisionBlockToken(this.revision.uid, blockMetadata.index, this.signal);
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

        this.ongoingDownloads.get(blockMetadata.index)!.decryptedBufferedBlock = decryptedBlock;
        logger.info(`Downloaded`);
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

    private async flushCompletedBlocks(writer: WritableStreamDefaultWriter<Uint8Array>) {
        this.logger.debug(`Flushing completed blocks`);
        while (this.isNextBlockDownloaded) {
            const decryptedBlock = this.ongoingDownloads.get(this.nextBlockIndex)!.decryptedBufferedBlock!;
            this.logger.info(`Flushing completed block ${this.nextBlockIndex}`);
            try {
                await writer.write(decryptedBlock);
            } catch (error) {
                this.logger.error(`Failed to write block, retrying once`, error);
                await writer.write(decryptedBlock);
            }
            this.ongoingDownloads.delete(this.nextBlockIndex);
            this.nextBlockIndex++;
        }
    }

    private get downloadPromises() {
        return this.ongoingDownloads.values().map(({ downloadPromise }) => downloadPromise);
    }

    private get ongoingDownloadPromises() {
        return this.ongoingDownloads.values()
            .filter((value) => value.decryptedBufferedBlock === undefined)
            .map((value) => value.downloadPromise);
    }

    private get isNextBlockDownloaded() {
        return !!this.ongoingDownloads.get(this.nextBlockIndex)?.decryptedBufferedBlock;
    }
}
