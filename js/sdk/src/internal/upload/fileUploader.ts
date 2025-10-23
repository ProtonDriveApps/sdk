import { Thumbnail, UploadMetadata } from '../../interface';
import { UploadAPIService } from './apiService';
import { BlockVerifier } from './blockVerifier';
import { UploadController } from './controller';
import { UploadCryptoService } from './cryptoService';
import { NodeRevisionDraft } from './interface';
import { UploadManager } from './manager';
import { StreamUploader } from './streamUploader';
import { UploadTelemetry } from './telemetry';

/**
 * Uploader is generic class responsible for creating a revision draft
 * and initiate the upload process for a file object or a stream.
 *
 * This class is not meant to be used directly, but rather to be extended
 * by `FileUploader` and `FileRevisionUploader`.
 */
class Uploader {
    protected controller: UploadController;
    protected abortController: AbortController;

    constructor(
        protected telemetry: UploadTelemetry,
        protected apiService: UploadAPIService,
        protected cryptoService: UploadCryptoService,
        protected manager: UploadManager,
        protected metadata: UploadMetadata,
        protected onFinish: () => void,
        protected signal?: AbortSignal,
    ) {
        this.telemetry = telemetry;
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.manager = manager;
        this.metadata = metadata;
        this.onFinish = onFinish;

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
        if (this.controller.promise) {
            throw new Error(`Upload already started`);
        }
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
        if (this.controller.promise) {
            throw new Error(`Upload already started`);
        }
        this.controller.promise = this.startUpload(stream, thumbnails, onProgress);
        return this.controller;
    }

    protected async startUpload(
        stream: ReadableStream,
        thumbnails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<{ nodeRevisionUid: string, nodeUid: string }> {
        const uploader = await this.initStreamUploader();
        return uploader.start(stream, thumbnails, onProgress);
    }

    protected async initStreamUploader(): Promise<StreamUploader> {
        const { revisionDraft, blockVerifier } = await this.createRevisionDraft();

        const onFinish = async (failure: boolean) => {
            this.onFinish();
            if (failure) {
                await this.manager.deleteDraftNode(revisionDraft.nodeUid);
            }
        };

        return this.newStreamUploader(
            blockVerifier,
            revisionDraft,
            onFinish,
        );
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

    protected async createRevisionDraft(): Promise<{ revisionDraft: NodeRevisionDraft; blockVerifier: BlockVerifier }> {
        throw new Error('Not implemented');
    }
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
        signal?: AbortSignal,
    ) {
        super(telemetry, apiService, cryptoService, manager, metadata, onFinish, signal);

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
        signal?: AbortSignal,
    ) {
        super(telemetry, apiService, cryptoService, manager, metadata, onFinish, signal);

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
}
