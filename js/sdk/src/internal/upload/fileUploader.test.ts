import { Thumbnail, ThumbnailType, UploadMetadata } from '../../interface';
import { APIHTTPError, HTTPErrorCode } from '../apiService';
import { FILE_CHUNK_SIZE, Fileuploader } from './fileUploader';
import { UploadTelemetry } from './telemetry';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';
import { UploadController } from './controller';
import { BlockVerifier } from './blockVerifier';
import { NodeRevisionDraft } from './interface';
import { UploadManager } from './manager';
import { IntegrityError } from '../../errors';

const BLOCK_ENCRYPTION_OVERHEAD = 10000;

async function mockEncryptBlock(verifyBlock: (block: Uint8Array) => Promise<void>, _: any, block: Uint8Array, index: number) {
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

function mockUploadBlock(_: string, __: string, encryptedBlock: Uint8Array, onProgress: (uploadedBytes: number) => void) {
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

    let uploader: Fileuploader;

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

        metadata = {
            // 3 blocks: 4 + 4 + 2 MB
            expectedSize: 10 * 1024 * 1024,
        } as UploadMetadata;

        controller = new UploadController();
        onFinish = jest.fn();
        abortController = new AbortController();

        uploader = new Fileuploader(
            telemetry,
            apiService,
            cryptoService,
            uploadManager,
            blockVerifier,
            revisionDraft,
            metadata,
            onFinish,
            abortController.signal,
        );
    });

    describe('writeFile', () => {
        it('should set modification time if not set', () => {
            // @ts-expect-error Ignore mocking File
            const file = {
                lastModified: 123456789,
                stream: jest.fn().mockReturnValue('stream'),
            } as File;
            const thumbnails: Thumbnail[] = [];
            const onProgress = jest.fn();

            const writeStreamSpy = jest.spyOn(uploader, 'writeStream').mockReturnValue(controller);

            uploader.writeFile(file, thumbnails, onProgress);

            expect(metadata.modificationTime).toEqual(new Date(123456789));
            expect(writeStreamSpy).toHaveBeenCalledWith('stream', thumbnails, onProgress);
        });
    });

    describe('writeStream', () => {
        let uploadStreamSpy: jest.SpyInstance;
        beforeEach(() => {
            uploadStreamSpy = jest.spyOn(uploader as any, 'uploadStream').mockResolvedValue('revisionUid');
        });

        it('should throw an error if upload already started', () => {
            uploader.writeStream(new ReadableStream(), [], jest.fn());

            expect(() => {
                uploader.writeStream(new ReadableStream(), [], jest.fn());
            }).toThrow('Upload already started');
        });

        it('should start the upload process', async () => {
            const stream = new ReadableStream();
            const thumbnails: Thumbnail[] = [];
            const onProgress = jest.fn();

            uploader.writeStream(stream, thumbnails, onProgress);
            expect(uploadStreamSpy).toHaveBeenCalledWith(stream, thumbnails, onProgress);
        });
    });

    describe('uploadStream', () => {
        let thumbnails: Thumbnail[];
        let thumbnailSize: number;

        let onProgress: (uploadedBytes: number) => void;
        let stream: ReadableStream<Uint8Array>;

        const verifySuccess = async () => {
            const controller = uploader.writeStream(stream, thumbnails, onProgress);
            await controller.completion();

            const numberOfExpectedBlocks = Math.ceil(metadata.expectedSize / FILE_CHUNK_SIZE);
            expect(uploadManager.commitDraft).toHaveBeenCalledTimes(1);
            expect(uploadManager.commitDraft).toHaveBeenCalledWith(
                revisionDraft,
                expect.anything(),
                metadata,
                {
                    size: metadata.expectedSize,
                    blockSizes: metadata.expectedSize ? [
                        ...Array(numberOfExpectedBlocks - 1).fill(FILE_CHUNK_SIZE),
                        metadata.expectedSize % FILE_CHUNK_SIZE
                    ] : [],
                    modificationTime: undefined,
                    digests: {
                        sha1: expect.anything(),
                    }
                },
                metadata.expectedSize + numberOfExpectedBlocks * BLOCK_ENCRYPTION_OVERHEAD,
            );
            expect(telemetry.uploadFinished).toHaveBeenCalledTimes(1);
            expect(telemetry.uploadFinished).toHaveBeenCalledWith('revisionUid', metadata.expectedSize + thumbnailSize);
            expect(telemetry.uploadFailed).not.toHaveBeenCalled();
            expect(onFinish).toHaveBeenCalledTimes(1);
            expect(onFinish).toHaveBeenCalledWith(false);
        };

        const verifyFailure = async (error: string, uploadedBytes: number | undefined, expectedSize = metadata.expectedSize) => {
            const controller = uploader.writeStream(stream, thumbnails, onProgress);
            await expect(controller.completion()).rejects.toThrow(error);

            expect(telemetry.uploadFinished).not.toHaveBeenCalled();
            expect(telemetry.uploadFailed).toHaveBeenCalledTimes(1);
            expect(telemetry.uploadFailed).toHaveBeenCalledWith(
                'revisionUid',
                new Error(error),
                uploadedBytes === undefined ? expect.anything() : uploadedBytes,
                expectedSize,
            );
            expect(onFinish).toHaveBeenCalledTimes(1);
            expect(onFinish).toHaveBeenCalledWith(true);
        };

        const verifyOnProgress = async (uploadedBytes: number[]) => {
            expect(onProgress).toHaveBeenCalledTimes(uploadedBytes.length);
            for (let i = 0; i < uploadedBytes.length; i++) {
                expect(onProgress).toHaveBeenNthCalledWith(i + 1, uploadedBytes[i]);
            }
        };

        beforeEach(() => {
            onProgress = jest.fn();
            thumbnails = [
                {
                    type: ThumbnailType.Type1,
                    thumbnail: new Uint8Array(1024),
                }
            ];
            thumbnailSize = thumbnails.reduce((acc, thumbnail) => acc + thumbnail.thumbnail.length, 0);
            stream = new ReadableStream({
                start(controller) {
                    const chunkSize = 1024;
                    const chunkCount = metadata.expectedSize / chunkSize;
                    for (let i = 1; i <= chunkCount; i++) {
                        controller.enqueue(new Uint8Array(chunkSize));
                    }
                    controller.close();
                },
            });
        });

        it("should upload successfully", async () => {
            await verifySuccess();
            expect(apiService.requestBlockUpload).toHaveBeenCalledTimes(1);
            expect(apiService.uploadBlock).toHaveBeenCalledTimes(4); // 3 blocks + 1 thumbnail
            expect(blockVerifier.verifyBlock).toHaveBeenCalledTimes(3); // 3 blocks
            expect(telemetry.logBlockVerificationError).not.toHaveBeenCalled();
            await verifyOnProgress([thumbnailSize, 4 * 1024 * 1024, 4 * 1024 * 1024, 2 * 1024 * 1024]);
        });

        it("should upload successfully empty file without thumbnail", async () => {
            metadata = {
                expectedSize: 0,
            } as UploadMetadata;
            stream = new ReadableStream({
                start(controller) {
                    controller.close();
                },
            });
            thumbnails = [];
            thumbnailSize = 0;
            uploader = new Fileuploader(
                telemetry,
                apiService,
                cryptoService,
                uploadManager,
                blockVerifier,
                revisionDraft,
                metadata,
                onFinish,
            );

            await verifySuccess();
            expect(apiService.requestBlockUpload).toHaveBeenCalledTimes(0);
            expect(apiService.uploadBlock).toHaveBeenCalledTimes(0);
            expect(blockVerifier.verifyBlock).toHaveBeenCalledTimes(0);
            await verifyOnProgress([]);
        });

        it("should upload successfully empty file with thumbnail", async () => {
            metadata = {
                expectedSize: 0,
            } as UploadMetadata;
            stream = new ReadableStream({
                start(controller) {
                    controller.close();
                },
            });
            uploader = new Fileuploader(
                telemetry,
                apiService,
                cryptoService,
                uploadManager,
                blockVerifier,
                revisionDraft,
                metadata,
                onFinish,
            );

            await verifySuccess();
            expect(apiService.requestBlockUpload).toHaveBeenCalledTimes(1);
            expect(apiService.uploadBlock).toHaveBeenCalledTimes(1);
            expect(blockVerifier.verifyBlock).toHaveBeenCalledTimes(0);
            await verifyOnProgress([thumbnailSize]);
        });

        it('should handle failure when encrypting thumbnails', async () => {
            cryptoService.encryptThumbnail = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to encrypt thumbnail');
            });

            await verifyFailure('Failed to encrypt thumbnail', 0);
            expect(cryptoService.encryptThumbnail).toHaveBeenCalledTimes(1);
        });

        it('should handle failure when encrypting block', async () => {
            cryptoService.encryptBlock = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to encrypt block');
            });

            // Encrypting thumbnails is before blocks, thus it can be uploaded before failure.
            await verifyFailure('Failed to encrypt block', 1024);
            // 1 block + 1 retry, others are skipped
            expect(cryptoService.encryptBlock).toHaveBeenCalledTimes(2);
        });

        it('should handle one time-off failure when encrypting block', async () => {
            let count = 0;
            cryptoService.encryptBlock = jest.fn().mockImplementation(async function (verifyBlock, keys, block, index) {
                if (count === 0) {
                    count++;
                    throw new Error('Failed to encrypt block');
                }
                return mockEncryptBlock(verifyBlock, keys, block, index);
            });

            await verifySuccess();
            // 1 block + 1 retry + 2 other blocks without retry
            expect(cryptoService.encryptBlock).toHaveBeenCalledTimes(4);
            await verifyOnProgress([thumbnailSize, 4 * 1024 * 1024, 4 * 1024 * 1024, 2 * 1024 * 1024]);
        });

        it('should handle failure when requesting tokens', async () => {
            apiService.requestBlockUpload = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to request tokens');
            });

            await verifyFailure('Failed to request tokens', 0);
        });

        it('should handle failure when uploading thumbnail', async () => {
            apiService.uploadBlock = jest.fn().mockImplementation(async function (bareUrl, token, block, onProgress) {
                if (token === 'token/thumbnail:1') {
                    throw new Error('Failed to upload thumbnail');
                }
                return mockUploadBlock(bareUrl, token, block, onProgress);
            });

            // 10 MB uploaded as blocks still uploaded
            await verifyFailure('Failed to upload thumbnail', 10 * 1024 * 1024);
        });

        it('should handle one time-off failure when uploading thubmnail', async () => {
            let count = 0;
            apiService.uploadBlock = jest.fn().mockImplementation(async function (bareUrl, token, block, onProgress) {
                if (token === 'token/thumbnail:1' && count === 0) {
                    count++;
                    throw new Error('Failed to upload thumbnail');
                }
                return mockUploadBlock(bareUrl, token, block, onProgress);
            });

            await verifySuccess();
            expect(apiService.requestBlockUpload).toHaveBeenCalledTimes(1);
            // 3 blocks + 1 retry + 1 thumbnail
            expect(apiService.uploadBlock).toHaveBeenCalledTimes(5);
            await verifyOnProgress([4 * 1024 * 1024, 4 * 1024 * 1024, 2 * 1024 * 1024, 1024]);
        });

        it('should handle failure when uploading block', async () => {
            apiService.uploadBlock = jest.fn().mockImplementation(async function (bareUrl, token, block, onProgress) {
                if (token === 'token/block:3') {
                    throw new Error('Failed to upload block');
                }
                return mockUploadBlock(bareUrl, token, block, onProgress);
            });

            // ~8 MB uploaded as 2 first blocks + 1 thumbnail still uploaded
            await verifyFailure('Failed to upload block', 8 * 1024 * 1024 + 1024);
        });

        it('should handle one time-off failure when uploading block', async () => {
            let count = 0;
            apiService.uploadBlock = jest.fn().mockImplementation(async function (bareUrl, token, block, onProgress) {
                if (token === 'token/block:2' && count === 0) {
                    count++;
                    throw new Error('Failed to upload block');
                }
                return mockUploadBlock(bareUrl, token, block, onProgress);
            });

            await verifySuccess();
            expect(apiService.requestBlockUpload).toHaveBeenCalledTimes(1);
            // 3 blocks + 1 retry + 1 thumbnail
            expect(apiService.uploadBlock).toHaveBeenCalledTimes(5);
            await verifyOnProgress([1024, 4 * 1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024]);
        });

        it('should handle expired token when uploading block', async () => {
            let count = 0;
            apiService.uploadBlock = jest.fn().mockImplementation(async function (bareUrl, token, block, onProgress) {
                if (token === 'token/block:2' && count === 0) {
                    count++;
                    throw new APIHTTPError('Expired token', HTTPErrorCode.NOT_FOUND);
                }
                return mockUploadBlock(bareUrl, token, block, onProgress);
            });

            await verifySuccess();
            // 1 for first try + 1 for retry
            expect(apiService.requestBlockUpload).toHaveBeenCalledTimes(2);
            expect(apiService.requestBlockUpload).toHaveBeenCalledWith(
                revisionDraft.nodeRevisionUid,
                revisionDraft.nodeKeys.signatureAddress.addressId,
                {
                    contentBlocks: [
                        {
                            index: 2,
                            encryptedSize: 4 * 1024 * 1024 + 10000,
                            hash: 'blockHash',
                            armoredSignature: 'signature',
                            verificationToken: 'verificationToken',
                        }
                    ],
                },
            );
            // 3 blocks + 1 retry + 1 thumbnail
            expect(apiService.uploadBlock).toHaveBeenCalledTimes(5);
            await verifyOnProgress([1024, 4 * 1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024]);
        });

        it('should handle abortion', async () => {
            const error = new Error('Aborted');
            const controller = uploader.writeStream(stream, thumbnails, onProgress);
            abortController.abort(error);
            await controller.completion();
            expect(apiService.uploadBlock.mock.calls[0][4]?.aborted).toBe(true);
        });

        describe('verifyIntegrity', () => {
            it('should report block verification error', async () => {
                blockVerifier.verifyBlock = jest.fn().mockRejectedValue(new IntegrityError('Block verification error'));
                await verifyFailure('Block verification error', 1024);
                expect(telemetry.logBlockVerificationError).toHaveBeenCalledWith(false);
            });

            it('should report block verification error when retry helped', async () => {
                blockVerifier.verifyBlock = jest.fn().mockRejectedValueOnce(new IntegrityError('Block verification error')).mockResolvedValue({
                    verificationToken: new Uint8Array(),
                });
                await verifySuccess();
                expect(telemetry.logBlockVerificationError).toHaveBeenCalledWith(true);
            });

            it('should throw an error if block count does not match', async () => {
                uploader = new Fileuploader(
                    telemetry,
                    apiService,
                    cryptoService,
                    uploadManager,
                    blockVerifier,
                    revisionDraft,
                    {
                        // Fake expected size to break verification
                        expectedSize: 1 * 1024 * 1024 + 1024,
                        mediaType: '',
                    },
                    onFinish,
                );

                await verifyFailure(
                    'Some file parts failed to upload',
                    10 * 1024 * 1024 + 1024,
                    1 * 1024 * 1024 + 1024,
                );
            });

            it('should throw an error if file size does not match', async () => {
                cryptoService.encryptBlock = jest.fn().mockImplementation(async (_, __, block, index) => ({
                    index,
                    encryptedData: block,
                    armoredSignature: 'signature',
                    verificationToken: 'verificationToken',
                    originalSize: 0, // Fake original size to break verification
                    encryptedSize: block.length + 10000,
                    hash: 'blockHash',
                }));

                await verifyFailure('Some file bytes failed to upload', 10 * 1024 * 1024 + 1024);
            });
        });
    });
});
