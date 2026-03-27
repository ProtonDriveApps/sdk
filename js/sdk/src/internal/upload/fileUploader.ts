import { Thumbnail, UploadMetadata } from '../../interface';
import { UploadAPIService } from './apiService';
import { BlockVerifier } from './blockVerifier';
import { UploadController } from './controller';
import { UploadCryptoService } from './cryptoService';
import { NodeRevisionDraft } from './interface';
import { UploadManager } from './manager';
import { SmallFileRevisionUploader, SmallFileUploader } from './smallFileUploader';
import { StreamUploader } from './streamUploader';
import { UploadTelemetry } from './telemetry';

/**
 * Uploader is generic class responsible for creating a revision draft
 * and initiate the upload process for a file object or a stream.
 *
 * This class is not meant to be used directly, but rather to be extended
 * by `FileUploader`, `FileRevisionUploader`, or `SmallFileUploader`.
 */
export abstract class Uploader {
    protected controller: UploadController;
    protected abortController: AbortController;

    constructor(
        protected telemetry: UploadTelemetry,
        protected apiService: UploadAPIService,
        protected cryptoService: UploadCryptoService,
        protected manager: UploadManager,
        protected metadata: UploadMetadata,
        protected onFinish: () => void,
        protected shouldUseSmallFileUpload: (expectedSize: number) => Promise<boolean>,
        protected signal?: AbortSignal,
    ) {
        this.telemetry = telemetry;
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.manager = manager;
        this.metadata = metadata;
        this.onFinish = onFinish;
        this.shouldUseSmallFileUpload = shouldUseSmallFileUpload;

        this.signal = signal;
        this.abortController = new AbortController();
        if (signal) {
            signal.addEventListener('abort', () => {
                this.abortController.abort();
            });
        }

        this.controller = new UploadController(this.abortController.signal);
    }

    async uploadFromFile(
        fileObject: File,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<UploadController> {
        this.assertNotStartedYet();
        this.assertUniqueThumbnailTypes(thumbnails);

        if (!this.metadata.mediaType) {
            this.metadata.mediaType = fileObject.type;
        }
        if (!this.metadata.expectedSize) {
            this.metadata.expectedSize = fileObject.size;
        }
        if (!this.metadata.modificationTime) {
            this.metadata.modificationTime = new Date(fileObject.lastModified);
        }
        this.controller.promise = this.startUpload(fileObject.stream(), thumbnails, onProgress);
        return this.controller;
    }

    async uploadFromStream(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<UploadController> {
        this.assertNotStartedYet();
        this.assertUniqueThumbnailTypes(thumbnails);

        this.controller.promise = this.startUpload(stream, thumbnails, onProgress);
        return this.controller;
    }

    private assertNotStartedYet(): void {
        if (this.controller.promise) {
            throw new Error(`Upload already started`);
        }
    }

    private assertUniqueThumbnailTypes(thumbnails: Thumbnail[]): void {
        const uniqueThumbnailTypes = new Set(thumbnails.map(({ type }) => type));
        if (uniqueThumbnailTypes.size !== thumbnails.length) {
            throw new Error('Duplicate thumbnail types');
        }
    }

    protected async startUpload(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<{ nodeRevisionUid: string; nodeUid: string }> {
        const expectedEncryptedTotalSize = this.getExpectedEncryptedTotalSize(thumbnails);
        if (await this.shouldUseSmallFileUpload(expectedEncryptedTotalSize)) {
            return this.initSmallFileUploader(stream, thumbnails, onProgress);
        }

        const uploader = await this.initStreamUploader();
        return uploader.start(stream, thumbnails, onProgress);
    }

    private getExpectedEncryptedTotalSize(thumbnails: Thumbnail[]): number {
        const thumbnailSize = thumbnails.reduce((acc, thumbnail) => acc + thumbnail.thumbnail.length, 0);
        const totalSize = this.metadata.expectedSize + thumbnailSize;
        const expectedEncryptedTotalSize = totalSize * 1.1; // 10% margin for encryption overhead
        return expectedEncryptedTotalSize;
    }

    protected abstract initSmallFileUploader(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<{ nodeRevisionUid: string; nodeUid: string }>;

    protected async initStreamUploader(): Promise<StreamUploader> {
        const { revisionDraft, blockVerifier } = await this.createRevisionDraft();

        const onFinish = async (failure: boolean) => {
            this.onFinish();
            if (failure) {
                await this.deleteRevisionDraft(revisionDraft);
            }
        };

        return this.newStreamUploader(blockVerifier, revisionDraft, onFinish);
    }

    protected async newStreamUploader(
        blockVerifier: BlockVerifier,
        revisionDraft: NodeRevisionDraft,
        onFinish: (failure: boolean) => Promise<void>,
    ): Promise<StreamUploader> {
        return new StreamUploader(
            this.telemetry,
            this.apiService,
            this.cryptoService,
            this.manager,
            blockVerifier,
            revisionDraft,
            this.metadata,
            onFinish,
            this.controller,
            this.abortController,
        );
    }

    protected abstract createRevisionDraft(): Promise<{
        revisionDraft: NodeRevisionDraft;
        blockVerifier: BlockVerifier;
    }>;

    protected abstract deleteRevisionDraft(revisionDraft: NodeRevisionDraft): Promise<void>;
}

/**
 * Uploader implementation for a new file.
 */
export class FileUploader extends Uploader {
    constructor(
        telemetry: UploadTelemetry,
        apiService: UploadAPIService,
        cryptoService: UploadCryptoService,
        manager: UploadManager,
        private parentFolderUid: string,
        private name: string,
        metadata: UploadMetadata,
        onFinish: () => void,
        protected shouldUseSmallFileUpload: (expectedSize: number) => Promise<boolean>,
        signal?: AbortSignal,
    ) {
        super(telemetry, apiService, cryptoService, manager, metadata, onFinish, shouldUseSmallFileUpload, signal);

        this.parentFolderUid = parentFolderUid;
        this.name = name;
    }

    protected async createRevisionDraft(): Promise<{ revisionDraft: NodeRevisionDraft; blockVerifier: BlockVerifier }> {
        let revisionDraft, blockVerifier;
        try {
            revisionDraft = await this.manager.createDraftNode(this.parentFolderUid, this.name, this.metadata);

            blockVerifier = new BlockVerifier(
                this.apiService,
                this.cryptoService,
                revisionDraft.nodeKeys.key,
                revisionDraft.nodeRevisionUid,
            );
            await blockVerifier.loadVerificationData();
        } catch (error: unknown) {
            this.onFinish();
            if (revisionDraft) {
                await this.manager.deleteDraftNode(revisionDraft.nodeUid);
            }
            void this.telemetry.uploadInitFailed(this.parentFolderUid, error, this.metadata.expectedSize);
            throw error;
        }

        return {
            revisionDraft,
            blockVerifier,
        };
    }

    protected async deleteRevisionDraft(revisionDraft: NodeRevisionDraft): Promise<void> {
        await this.manager.deleteDraftNode(revisionDraft.nodeUid);
    }

    protected async initSmallFileUploader(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<{ nodeRevisionUid: string; nodeUid: string }> {
        const uploader = new SmallFileUploader(
            this.telemetry,
            this.cryptoService,
            this.manager,
            this.metadata,
            this.onFinish,
            this.signal,
            this.parentFolderUid,
            this.name,
        );
        return uploader.upload(stream, thumbnails, onProgress);
    }
}

/**
 * Uploader implementation for a new file revision.
 */
export class FileRevisionUploader extends Uploader {
    constructor(
        telemetry: UploadTelemetry,
        apiService: UploadAPIService,
        cryptoService: UploadCryptoService,
        manager: UploadManager,
        private nodeUid: string,
        metadata: UploadMetadata,
        onFinish: () => void,
        protected shouldUseSmallFileUpload: (expectedSize: number) => Promise<boolean>,
        signal?: AbortSignal,
    ) {
        super(telemetry, apiService, cryptoService, manager, metadata, onFinish, shouldUseSmallFileUpload, signal);

        this.nodeUid = nodeUid;
    }

    protected async createRevisionDraft(): Promise<{ revisionDraft: NodeRevisionDraft; blockVerifier: BlockVerifier }> {
        let revisionDraft, blockVerifier;
        try {
            revisionDraft = await this.manager.createDraftRevision(this.nodeUid, this.metadata);

            blockVerifier = new BlockVerifier(
                this.apiService,
                this.cryptoService,
                revisionDraft.nodeKeys.key,
                revisionDraft.nodeRevisionUid,
            );
            await blockVerifier.loadVerificationData();
        } catch (error: unknown) {
            this.onFinish();
            if (revisionDraft) {
                await this.manager.deleteDraftRevision(revisionDraft.nodeRevisionUid);
            }
            void this.telemetry.uploadInitFailed(this.nodeUid, error, this.metadata.expectedSize);
            throw error;
        }

        return {
            revisionDraft,
            blockVerifier,
        };
    }

    protected async deleteRevisionDraft(revisionDraft: NodeRevisionDraft): Promise<void> {
        await this.manager.deleteDraftRevision(revisionDraft.nodeRevisionUid);
    }

    protected async initSmallFileUploader(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<{ nodeRevisionUid: string; nodeUid: string }> {
        const uploader = new SmallFileRevisionUploader(
            this.telemetry,
            this.cryptoService,
            this.manager,
            this.metadata,
            this.onFinish,
            this.signal,
            this.nodeUid,
        );
        return uploader.upload(stream, thumbnails, onProgress);
    }
}
