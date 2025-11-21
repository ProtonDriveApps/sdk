import { DriveCrypto } from '../../crypto';
import { ProtonDriveTelemetry, UploadMetadata, Thumbnail } from '../../interface';
import { DriveAPIService, drivePaths } from '../apiService';
import { generateFileExtendedAttributes } from '../nodes';
import { splitNodeRevisionUid } from '../uids';
import { UploadAPIService } from '../upload/apiService';
import { BlockVerifier } from '../upload/blockVerifier';
import { UploadController } from '../upload/controller';
import { UploadCryptoService } from '../upload/cryptoService';
import { FileUploader } from '../upload/fileUploader';
import { NodeRevisionDraft, NodesService } from '../upload/interface';
import { UploadManager } from '../upload/manager';
import { StreamUploader } from '../upload/streamUploader';
import { UploadTelemetry } from '../upload/telemetry';

type PostCommitRevisionRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCommitRevisionResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['put']['responses']['200']['content']['application/json'];

export type PhotoUploadMetadata = UploadMetadata & {
    captureTime?: Date;
    mainPhotoLinkID?: string;
    // TODO: handle tags enum in the SDK
    tags?: (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)[];
};

export class PhotoFileUploader extends FileUploader {
    private photoApiService: PhotoUploadAPIService;
    private photoManager: PhotoUploadManager;
    private photoMetadata: PhotoUploadMetadata;

    constructor(
        telemetry: UploadTelemetry,
        apiService: PhotoUploadAPIService,
        cryptoService: UploadCryptoService,
        manager: PhotoUploadManager,
        parentFolderUid: string,
        name: string,
        metadata: PhotoUploadMetadata,
        onFinish: () => void,
        signal?: AbortSignal,
    ) {
        super(telemetry, apiService, cryptoService, manager, parentFolderUid, name, metadata, onFinish, signal);
        this.photoApiService = apiService;
        this.photoManager = manager;
        this.photoMetadata = metadata;
    }

    protected async newStreamUploader(
        blockVerifier: BlockVerifier,
        revisionDraft: NodeRevisionDraft,
        onFinish: (failure: boolean) => Promise<void>,
    ): Promise<StreamUploader> {
        return new PhotoStreamUploader(
            this.telemetry,
            this.photoApiService,
            this.cryptoService,
            this.photoManager,
            blockVerifier,
            revisionDraft,
            this.photoMetadata,
            onFinish,
            this.controller,
            this.signal,
        );
    }
}

export class PhotoStreamUploader extends StreamUploader {
    private photoUploadManager: PhotoUploadManager;
    private photoMetadata: PhotoUploadMetadata;

    constructor(
        telemetry: UploadTelemetry,
        apiService: PhotoUploadAPIService,
        cryptoService: UploadCryptoService,
        uploadManager: PhotoUploadManager,
        blockVerifier: BlockVerifier,
        revisionDraft: NodeRevisionDraft,
        metadata: PhotoUploadMetadata,
        onFinish: (failure: boolean) => Promise<void>,
        controller: UploadController,
        signal?: AbortSignal,
    ) {
        const abortController = new AbortController();
        if (signal) {
            signal.addEventListener('abort', () => {
                abortController.abort();
            });
        }

        super(
            telemetry,
            apiService,
            cryptoService,
            uploadManager,
            blockVerifier,
            revisionDraft,
            metadata,
            onFinish,
            controller,
            abortController,
        );
        this.photoUploadManager = uploadManager;
        this.photoMetadata = metadata;
    }

    async commitFile(thumbnails: Thumbnail[]) {
        this.verifyIntegrity(thumbnails);

        const extendedAttributes = {
            modificationTime: this.metadata.modificationTime,
            size: this.metadata.expectedSize,
            blockSizes: this.uploadedBlockSizes,
            digests: this.digests.digests(),
        };

        await this.photoUploadManager.commitDraftPhoto(this.revisionDraft, this.manifest, extendedAttributes, this.photoMetadata);
    }
}

export class PhotoUploadManager extends UploadManager {
    private photoApiService: PhotoUploadAPIService;
    private photoCryptoService: PhotoUploadCryptoService;

    constructor(
        telemetry: ProtonDriveTelemetry,
        apiService: PhotoUploadAPIService,
        cryptoService: PhotoUploadCryptoService,
        nodesService: NodesService,
        clientUid: string | undefined,
    ) {
        super(telemetry, apiService, cryptoService, nodesService, clientUid);
        this.photoApiService = apiService;
        this.photoCryptoService = cryptoService;
    }

    async commitDraftPhoto(
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
        uploadMetadata: PhotoUploadMetadata,
    ): Promise<void> {
        if (!nodeRevisionDraft.parentNodeKeys) {
            throw new Error('Parent node keys are required for photo upload');
        }

        // TODO: handle photo extended attributes in the SDK - now it must be passed from the client
        const generatedExtendedAttributes = generateFileExtendedAttributes(extendedAttributes, uploadMetadata.additionalMetadata);
        const nodeCommitCrypto = await this.cryptoService.commitFile(
            nodeRevisionDraft.nodeKeys,
            manifest,
            generatedExtendedAttributes,
        );

        const sha1 = extendedAttributes.digests.sha1;
        const contentHash = await this.photoCryptoService.generateContentHash(sha1, nodeRevisionDraft.parentNodeKeys?.hashKey);
        const photo = {
            contentHash,
            captureTime: uploadMetadata.captureTime || extendedAttributes.modificationTime,
            mainPhotoLinkID: uploadMetadata.mainPhotoLinkID,
            tags: uploadMetadata.tags,
        }
        await this.photoApiService.commitDraftPhoto(nodeRevisionDraft.nodeRevisionUid, nodeCommitCrypto, photo);
        await this.notifyNodeUploaded(nodeRevisionDraft);
    }
}

export class PhotoUploadCryptoService extends UploadCryptoService {
    constructor(
        driveCrypto: DriveCrypto,
        nodesService: NodesService,
    ) {
        super(driveCrypto, nodesService);
    }

    async generateContentHash(sha1: string, parentHashKey: Uint8Array): Promise<string> {
        return this.driveCrypto.generateLookupHash(sha1, parentHashKey);
    }
}

export class PhotoUploadAPIService extends UploadAPIService {
    constructor(apiService: DriveAPIService, clientUid: string | undefined) {
        super(apiService, clientUid);
    }

    async commitDraftPhoto(
        draftNodeRevisionUid: string,
        options: {
            armoredManifestSignature: string;
            signatureEmail: string;
            armoredExtendedAttributes?: string;
        },
        photo: {
            contentHash: string;
            captureTime?: Date;
            mainPhotoLinkID?: string;
            // TODO: handle tags enum in the SDK
            tags?: (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)[];
        },
    ): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        await this.apiService.put<
            // TODO: Deprected fields but not properly marked in the types.
            Omit<PostCommitRevisionRequest, 'BlockNumber' | 'BlockList' | 'ThumbnailToken' | 'State'>,
            PostCommitRevisionResponse
        >(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}`, {
            ManifestSignature: options.armoredManifestSignature,
            SignatureAddress: options.signatureEmail,
            XAttr: options.armoredExtendedAttributes || null,
            Photo: {
                ContentHash: photo.contentHash,
                CaptureTime: photo.captureTime ? Math.floor(photo.captureTime?.getTime() /1000) : 0,
                MainPhotoLinkID: photo.mainPhotoLinkID || null,
                Tags: photo.tags || [],
                Exif: null, // Deprecated field, not used.
            },
        });
    }
}
