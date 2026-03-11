import { IntegrityError } from '../../errors';
import { Thumbnail, ThumbnailType, UploadMetadata } from '../../interface';
import { SmallFileUploader, SmallFileRevisionUploader } from './smallFileUploader';
import { UploadTelemetry } from './telemetry';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';
import { UploadManager } from './manager';
import { NodeCrypto } from './interface';

const MOCK_BLOCK_HASH = new Uint8Array(32).fill(1);
const MOCK_VERIFICATION_TOKEN = new Uint8Array(16).fill(2);

function createStream(bytes: number[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(bytes));
            controller.close();
        },
    });
}

function mockEncryptBlock(
    verifyBlock: (block: Uint8Array) => Promise<{ verificationToken: Uint8Array }>,
    _nodeKeys: unknown,
    block: Uint8Array,
    _index: number,
) {
    const encryptedData = new Uint8Array(block);
    return (async () => {
        await verifyBlock(encryptedData);
        return {
            index: 0,
            encryptedData,
            armoredSignature: 'mockBlockSignature',
            verificationToken: MOCK_VERIFICATION_TOKEN,
            originalSize: block.length,
            encryptedSize: block.length + 100,
            hash: 'blockHash',
            hashPromise: Promise.resolve(MOCK_BLOCK_HASH),
        };
    })();
}

describe('SmallFileUploader', () => {
    let telemetry: UploadTelemetry;
    let apiService: jest.Mocked<UploadAPIService>;
    let cryptoService: jest.Mocked<UploadCryptoService>;
    let uploadManager: jest.Mocked<UploadManager>;
    let metadata: UploadMetadata;
    let onFinish: jest.Mock;
    let abortController: AbortController;

    const parentFolderUid = 'parentFolderUid';
    const name = 'test-file.txt';

    const mockNodeCrypto = {
        nodeKeys: {
            decrypted: { key: {} as any },
            encrypted: {
                armoredKey: 'armoredKey',
                armoredPassphrase: 'armoredPassphrase',
                armoredPassphraseSignature: 'armoredPassphraseSignature',
            },
        },
        contentKey: {
            encrypted: {
                contentKeyPacket: new Uint8Array(10),
                base64ContentKeyPacket: 'base64ContentKeyPacket',
                armoredContentKeyPacketSignature: 'armoredContentKeyPacketSignature',
            },
            decrypted: { contentKeyPacketSessionKey: {} as any },
        },
        encryptedNode: {
            encryptedName: 'encryptedName',
            hash: 'hash',
        },
        signingKeys: { email: 'test@test.com', addressId: 'addr', nameAndPassphraseSigningKey: {} as any, contentSigningKey: {} as any },
    } as NodeCrypto & { parentHashKey?: Uint8Array };

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        telemetry = {
            getLoggerForRevision: jest.fn().mockReturnValue({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            }),
            getLoggerForSmallUpload: jest.fn().mockReturnValue({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            }),
            logBlockVerificationError: jest.fn(),
            uploadFailed: jest.fn(),
            uploadFinished: jest.fn(),
            uploadInitFailed: jest.fn(),
        };

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {};

        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            encryptThumbnail: jest.fn().mockImplementation(async (_nodeKeys, thumbnail: Thumbnail) => ({
                type: thumbnail.type,
                encryptedData: new Uint8Array(thumbnail.thumbnail),
                originalSize: thumbnail.thumbnail.length,
                encryptedSize: thumbnail.thumbnail.length + 100,
                hash: 'thumbnailHash',
            })),
            encryptBlock: jest.fn().mockImplementation(mockEncryptBlock),
            verifyBlock: jest.fn().mockResolvedValue({ verificationToken: MOCK_VERIFICATION_TOKEN }),
            commitFile: jest.fn().mockResolvedValue({
                armoredManifestSignature: 'mockManifestSignature',
                armoredExtendedAttributes: 'mockExtendedAttributes',
            }),
        };

        uploadManager = {
            generateNewFileCrypto: jest.fn().mockResolvedValue(mockNodeCrypto),
            uploadFile: jest.fn().mockResolvedValue({
                nodeUid: 'nodeUid',
                nodeRevisionUid: 'nodeRevisionUid',
            }),
        } as unknown as jest.Mocked<UploadManager>;

        metadata = {
            expectedSize: 3,
            mediaType: 'application/octet-stream',
        } as UploadMetadata;

        onFinish = jest.fn();
        abortController = new AbortController();
    });

    function createUploader() {
        return new SmallFileUploader(
            telemetry,
            apiService,
            cryptoService,
            uploadManager,
            metadata,
            onFinish,
            abortController.signal,
            parentFolderUid,
            name,
        );
    }

    describe('uploadFromStream', () => {
        const thumbnails: Thumbnail[] = [];
        const onProgress = jest.fn();

        it('should start upload and call manager.generateNewFileCrypto and manager.uploadFile', async () => {
            const uploader = createUploader();
            const stream = createStream([1, 2, 3]);

            const controller = await uploader.uploadFromStream(stream, thumbnails, onProgress);
            const result = await controller.completion();

            expect(uploadManager.generateNewFileCrypto).toHaveBeenCalledWith(parentFolderUid, name);
            expect(uploadManager.uploadFile).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ nodeUid: 'nodeUid', nodeRevisionUid: 'nodeRevisionUid' });
            expect(onProgress).toHaveBeenCalledWith(metadata.expectedSize);
        });

        it('should throw if upload already started', async () => {
            const uploader = createUploader();
            const stream = createStream([1, 2, 3]);

            await uploader.uploadFromStream(stream, thumbnails, onProgress);
            await expect(uploader.uploadFromStream(stream, thumbnails, onProgress)).rejects.toThrow(
                'Upload already started',
            );
        });
    });

    describe('buildPayloads (via upload flow)', () => {
        it('should build commitPayload, encryptedBlock, and encryptedThumbnails from stream and pass to manager.uploadFile', async () => {
            const uploader = createUploader();
            const stream = createStream([1, 2, 3]);
            const thumbnails: Thumbnail[] = [
                { type: ThumbnailType.Type1, thumbnail: new Uint8Array([10, 20]) },
                { type: ThumbnailType.Type2, thumbnail: new Uint8Array([30, 40, 50]) },
            ];

            await uploader.uploadFromStream(stream, thumbnails, undefined);
            await (uploader as any).controller.completion();

            expect(uploadManager.uploadFile).toHaveBeenCalledWith(
                parentFolderUid,
                mockNodeCrypto,
                metadata,
                expect.objectContaining({
                    armoredManifestSignature: 'mockManifestSignature',
                    armoredExtendedAttributes: 'mockExtendedAttributes',
                }),
                expect.objectContaining({
                    encryptedData: expect.any(Uint8Array),
                    armoredSignature: 'mockBlockSignature',
                    verificationToken: MOCK_VERIFICATION_TOKEN,
                }),
                [
                    { type: ThumbnailType.Type1, encryptedData: expect.any(Uint8Array) },
                    { type: ThumbnailType.Type2, encryptedData: expect.any(Uint8Array) },
                ],
            );

            expect(cryptoService.encryptBlock).toHaveBeenCalledTimes(1);
            expect(cryptoService.encryptThumbnail).toHaveBeenCalledTimes(2);
            expect(cryptoService.commitFile).toHaveBeenCalledWith(
                expect.anything(),
                MOCK_BLOCK_HASH,
                expect.any(String),
            );
        });

        it('should pass encrypted block data matching stream content to crypto.encryptBlock', async () => {
            const uploader = createUploader();
            const content = [5, 6, 7, 8, 9];
            metadata.expectedSize = content.length;
            const stream = createStream(content);

            await uploader.uploadFromStream(stream, [], undefined);
            await (uploader as any).controller.completion();

            expect(cryptoService.encryptBlock).toHaveBeenCalledWith(
                expect.any(Function),
                expect.anything(),
                new Uint8Array(content),
                0,
            );
        });

        it('should pass each thumbnail to crypto.encryptThumbnail with nodeKeys', async () => {
            const uploader = createUploader();
            const thumbnails: Thumbnail[] = [
                { type: ThumbnailType.Type1, thumbnail: new Uint8Array([1]) },
            ];
            const stream = createStream([1, 2, 3]);

            await uploader.uploadFromStream(stream, thumbnails, undefined);
            await (uploader as any).controller.completion();

            expect(cryptoService.encryptThumbnail).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: mockNodeCrypto.nodeKeys.decrypted.key,
                    contentKeyPacket: mockNodeCrypto.contentKey.encrypted.contentKeyPacket,
                    contentKeyPacketSessionKey: mockNodeCrypto.contentKey.decrypted.contentKeyPacketSessionKey,
                    signingKeys: mockNodeCrypto.signingKeys,
                }),
                { type: ThumbnailType.Type1, thumbnail: new Uint8Array([1]) },
            );
        });

        it('should call commitFile with manifest and extended attributes', async () => {
            const uploader = createUploader();
            const stream = createStream([1, 2, 3]);

            await uploader.uploadFromStream(stream, [], undefined);
            await (uploader as any).controller.completion();

            const [nodeKeys, manifest, extendedAttributes] = (cryptoService.commitFile as jest.Mock).mock.calls[0];
            expect(manifest).toEqual(MOCK_BLOCK_HASH);
            expect(extendedAttributes).toBeDefined();
            expect(nodeKeys).toBeDefined();
        });
    });

    describe('stream integrity', () => {
        it('should throw IntegrityError when stream size does not match expectedSize', async () => {
            const uploader = createUploader();
            metadata.expectedSize = 5;
            const stream = createStream([1, 2, 3]); // only 3 bytes

            const controller = await uploader.uploadFromStream(stream, [], undefined);

            await expect(controller.completion()).rejects.toThrow(IntegrityError);
            await expect(controller.completion()).rejects.toMatchObject({
                debug: { actual: 3, expected: 5 },
            });
        });

        it('should throw IntegrityError when stream sha1 does not match expectedSha1', async () => {
            const uploader = createUploader();
            metadata.expectedSha1 = 'a'.repeat(40); // wrong sha1
            const stream = createStream([1, 2, 3]);

            const controller = await uploader.uploadFromStream(stream, [], undefined);

            await expect(controller.completion()).rejects.toThrow(IntegrityError);
            await expect(controller.completion()).rejects.toMatchObject({
                debug: expect.objectContaining({
                    expectedSha1: 'a'.repeat(40),
                }),
            });
        });
    });

    describe('zero-byte file', () => {
        it('should upload zero-byte file without calling encryptBlock and pass undefined block to manager.uploadFile', async () => {
            metadata.expectedSize = 0;
            const uploader = createUploader();
            const stream = createStream([]);
            const onProgress = jest.fn();

            const controller = await uploader.uploadFromStream(stream, [], onProgress);
            const result = await controller.completion();

            expect(result).toEqual({ nodeUid: 'nodeUid', nodeRevisionUid: 'nodeRevisionUid' });
            expect(cryptoService.encryptBlock).not.toHaveBeenCalled();
            expect(uploadManager.uploadFile).toHaveBeenCalledWith(
                parentFolderUid,
                mockNodeCrypto,
                metadata,
                expect.objectContaining({
                    armoredManifestSignature: 'mockManifestSignature',
                    armoredExtendedAttributes: 'mockExtendedAttributes',
                }),
                undefined,
                [],
            );
            expect(cryptoService.commitFile).toHaveBeenCalledWith(
                expect.anything(),
                new Uint8Array(0),
                expect.any(String),
            );
            expect(onFinish).toHaveBeenCalled();
            expect(onProgress).toHaveBeenCalledWith(0);
        });
    });
});

describe('SmallFileRevisionUploader', () => {
    let telemetry: UploadTelemetry;
    let apiService: jest.Mocked<UploadAPIService>;
    let cryptoService: jest.Mocked<UploadCryptoService>;
    let uploadManager: jest.Mocked<UploadManager>;
    let metadata: UploadMetadata;
    let onFinish: jest.Mock;
    let abortController: AbortController;

    const nodeUid = 'nodeUid';

    const mockNodeKeys = {
        key: {} as any,
        contentKeyPacket: new Uint8Array(10),
        contentKeyPacketSessionKey: {} as any,
        signingKeys: { email: 'test@test.com', addressId: 'addr', nameAndPassphraseSigningKey: {} as any, contentSigningKey: {} as any },
    };

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        telemetry = {
            getLoggerForRevision: jest.fn().mockReturnValue({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            }),
            getLoggerForSmallUpload: jest.fn().mockReturnValue({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            }),
            logBlockVerificationError: jest.fn(),
            uploadFailed: jest.fn(),
            uploadFinished: jest.fn(),
            uploadInitFailed: jest.fn(),
        };

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {};

        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            encryptThumbnail: jest.fn().mockImplementation(async (_nodeKeys, thumbnail: Thumbnail) => ({
                type: thumbnail.type,
                encryptedData: new Uint8Array(thumbnail.thumbnail),
                originalSize: thumbnail.thumbnail.length,
                encryptedSize: thumbnail.thumbnail.length + 100,
                hash: 'thumbnailHash',
            })),
            encryptBlock: jest.fn().mockImplementation(
                async (
                    verifyBlock: (b: Uint8Array) => Promise<{ verificationToken: Uint8Array }>,
                    _: unknown,
                    block: Uint8Array,
                ) => {
                    await verifyBlock(block);
                    return {
                        index: 0,
                        encryptedData: block,
                        armoredSignature: 'mockBlockSignature',
                        verificationToken: MOCK_VERIFICATION_TOKEN,
                        originalSize: block.length,
                        encryptedSize: block.length + 100,
                        hash: 'blockHash',
                        hashPromise: Promise.resolve(MOCK_BLOCK_HASH),
                    };
                },
            ),
            verifyBlock: jest.fn().mockResolvedValue({ verificationToken: MOCK_VERIFICATION_TOKEN }),
            commitFile: jest.fn().mockResolvedValue({
                armoredManifestSignature: 'mockManifestSignature',
                armoredExtendedAttributes: 'mockExtendedAttributes',
            }),
        };

        uploadManager = {
            getExistingFileNodeCrypto: jest.fn().mockResolvedValue(mockNodeKeys),
            uploadSmallRevision: jest.fn().mockResolvedValue({
                nodeUid: 'nodeUid',
                nodeRevisionUid: 'nodeRevisionUid',
            }),
        } as unknown as jest.Mocked<UploadManager>;

        metadata = {
            expectedSize: 3,
            mediaType: 'application/octet-stream',
        } as UploadMetadata;

        onFinish = jest.fn();
        abortController = new AbortController();
    });

    function createUploader() {
        return new SmallFileRevisionUploader(
            telemetry,
            apiService,
            cryptoService,
            uploadManager,
            metadata,
            onFinish,
            abortController.signal,
            nodeUid,
        );
    }

    it('should get node crypto, build payloads, and call uploadSmallRevision', async () => {
        const uploader = createUploader();
        const stream = createStream([1, 2, 3]);

        const controller = await uploader.uploadFromStream(stream, [], undefined);
        const result = await controller.completion();

        expect(result).toEqual({ nodeUid: 'nodeUid', nodeRevisionUid: 'nodeRevisionUid' });
        expect(cryptoService.encryptBlock).toHaveBeenCalledWith(expect.any(Function), expect.anything(), Uint8Array.from([1, 2, 3]), 0);
        expect(uploadManager.getExistingFileNodeCrypto).toHaveBeenCalledWith(nodeUid);
        expect(uploadManager.uploadSmallRevision).toHaveBeenCalledWith(
            nodeUid,
            mockNodeKeys,
            expect.objectContaining({
                armoredManifestSignature: 'mockManifestSignature',
                armoredExtendedAttributes: 'mockExtendedAttributes',
            }),
            expect.objectContaining({
                encryptedData: expect.any(Uint8Array),
                armoredSignature: 'mockBlockSignature',
                verificationToken: MOCK_VERIFICATION_TOKEN,
            }),
            [],
        );
    });

    it('should upload zero-byte revision without calling encryptBlock and pass undefined block to uploadSmallRevision', async () => {
        metadata.expectedSize = 0;
        const uploader = createUploader();
        const stream = createStream([]);

        const controller = await uploader.uploadFromStream(stream, [], undefined);
        const result = await controller.completion();

        expect(result).toEqual({ nodeUid: 'nodeUid', nodeRevisionUid: 'nodeRevisionUid' });
        expect(cryptoService.encryptBlock).not.toHaveBeenCalled();
        expect(uploadManager.uploadSmallRevision).toHaveBeenCalledWith(
            nodeUid,
            mockNodeKeys,
            expect.objectContaining({
                armoredManifestSignature: 'mockManifestSignature',
                armoredExtendedAttributes: 'mockExtendedAttributes',
            }),
            undefined,
            [],
        );
        expect(cryptoService.commitFile).toHaveBeenCalledWith(expect.anything(), new Uint8Array(0), expect.any(String));
    });
});
