import { Thumbnail, UploadMetadata } from '../../interface';
import { FileUploader } from './fileUploader';
import { UploadTelemetry } from './telemetry';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';
import { UploadController } from './controller';
import { BlockVerifier } from './blockVerifier';
import { NodeRevisionDraft } from './interface';
import { UploadManager } from './manager';

const BLOCK_ENCRYPTION_OVERHEAD = 10000;

async function mockEncryptBlock(
    verifyBlock: (block: Uint8Array) => Promise<void>,
    _: any,
    block: Uint8Array,
    index: number,
) {
    await verifyBlock(block);
    return {
        index,
        encryptedData: block,
        armoredSignature: 'signature',
        verificationToken: 'verificationToken',
        originalSize: block.length,
        encryptedSize: block.length + BLOCK_ENCRYPTION_OVERHEAD,
        hash: 'blockHash',
    };
}

function mockUploadBlock(
    _: string,
    __: string,
    encryptedBlock: Uint8Array,
    onProgress: (uploadedBytes: number) => void,
) {
    onProgress(encryptedBlock.length);
}

describe('FileUploader', () => {
    let telemetry: UploadTelemetry;
    let apiService: jest.Mocked<UploadAPIService>;
    let cryptoService: UploadCryptoService;
    let uploadManager: UploadManager;
    let blockVerifier: BlockVerifier;
    let revisionDraft: NodeRevisionDraft;
    let metadata: UploadMetadata;
    let controller: UploadController;
    let onFinish: () => Promise<void>;
    let abortController: AbortController;

    let uploader: FileUploader;

    let startUploadSpy: jest.SpyInstance;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        telemetry = {
            getLoggerForRevision: jest.fn().mockReturnValue({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            }),
            logBlockVerificationError: jest.fn(),
            uploadFailed: jest.fn(),
            uploadFinished: jest.fn(),
        };

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            requestBlockUpload: jest.fn().mockImplementation((_, __, blocks) => ({
                blockTokens: blocks.contentBlocks.map((block: { index: number }) => ({
                    index: block.index,
                    bareUrl: `bareUrl/block:${block.index}`,
                    token: `token/block:${block.index}`,
                })),
                thumbnailTokens: (blocks.thumbnails || []).map((thumbnail: { type: number }) => ({
                    type: thumbnail.type,
                    bareUrl: `bareUrl/thumbnail:${thumbnail.type}`,
                    token: `token/thumbnail:${thumbnail.type}`,
                })),
            })),
            uploadBlock: jest.fn().mockImplementation(mockUploadBlock),
        };

        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            encryptThumbnail: jest.fn().mockImplementation(async (_, thumbnail) => ({
                type: thumbnail.type,
                encryptedData: thumbnail.thumbnail,
                originalSize: thumbnail.thumbnail.length,
                encryptedSize: thumbnail.thumbnail + 1000,
                hash: 'thumbnailHash',
            })),
            encryptBlock: jest.fn().mockImplementation(mockEncryptBlock),
        };

        // @ts-expect-error No need to implement all methods for mocking
        uploadManager = {
            commitDraft: jest.fn().mockResolvedValue(undefined),
        };

        // @ts-expect-error No need to implement all methods for mocking
        blockVerifier = {
            verifyBlock: jest.fn().mockResolvedValue(undefined),
        };

        revisionDraft = {
            nodeRevisionUid: 'revisionUid',
            nodeKeys: {
                signatureAddress: { addressId: 'addressId' },
            },
        } as NodeRevisionDraft;

        metadata = {} as UploadMetadata;

        controller = new UploadController();
        onFinish = jest.fn();
        abortController = new AbortController();

        uploader = new FileUploader(
            telemetry,
            apiService,
            cryptoService,
            uploadManager,
            'parentFolderUid',
            'name',
            metadata,
            onFinish,
            abortController.signal,
        );

        startUploadSpy = jest.spyOn(uploader as any, 'startUpload').mockReturnValue(Promise.resolve('revisionUid'));
    });

    describe('uploadFromFile', () => {
        // @ts-expect-error Ignore mocking File
        const file = {
            type: 'image/png',
            size: 1000,
            lastModified: 123456789,
            stream: jest.fn().mockReturnValue('stream'),
        } as File;
        const thumbnails: Thumbnail[] = [];
        const onProgress = jest.fn();

        it('should set media type if not set', async () => {
            await uploader.uploadFromFile(file, thumbnails, onProgress);

            expect(metadata.mediaType).toEqual('image/png');
            expect(startUploadSpy).toHaveBeenCalledWith('stream', thumbnails, onProgress);
        });

        it('should set expected size if not set', async () => {
            await uploader.uploadFromFile(file, thumbnails, onProgress);

            expect(metadata.expectedSize).toEqual(file.size);
            expect(startUploadSpy).toHaveBeenCalledWith('stream', thumbnails, onProgress);
        });

        it('should set modification time if not set', async () => {
            await uploader.uploadFromFile(file, thumbnails, onProgress);

            expect(metadata.modificationTime).toEqual(new Date(123456789));
            expect(startUploadSpy).toHaveBeenCalledWith('stream', thumbnails, onProgress);
        });

        it('should throw an error if upload already started', async () => {
            await uploader.uploadFromFile(file, thumbnails, onProgress);

            await expect(uploader.uploadFromFile(file, thumbnails, onProgress)).rejects.toThrow('Upload already started');
        });
    });

    describe('uploadFromStream', () => {
        const stream = new ReadableStream();
        const thumbnails: Thumbnail[] = [];
        const onProgress = jest.fn();

        it('should start the upload process', async () => {
            await uploader.uploadFromStream(stream, thumbnails, onProgress);

            expect(startUploadSpy).toHaveBeenCalledWith(stream, thumbnails, onProgress);
        });

        it('should throw an error if upload already started', async () => {
            await uploader.uploadFromStream(stream, thumbnails, onProgress);

            await expect(uploader.uploadFromStream(stream, thumbnails, onProgress)).rejects.toThrow(
                'Upload already started',
            );
        });
    });
});
