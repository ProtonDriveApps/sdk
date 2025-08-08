import { APIHTTPError, HTTPErrorCode } from '../apiService';
import { DecryptedRevision } from '../nodes';
import { FileDownloader } from './fileDownloader';
import { DownloadTelemetry } from './telemetry';
import { DownloadAPIService } from './apiService';
import { DownloadCryptoService } from './cryptoService';

function mockBlockDownload(_: string, token: string, onProgress: (downloadedBytes: number) => void) {
    const index = parseInt(token.slice(5, 6));
    const array = new Uint8Array(index);
    for (let i = 0; i < index; i++) {
        array[i] = i;
    }

    onProgress(array.length);
    return array;
}

describe('FileDownloader', () => {
    let telemetry: DownloadTelemetry;
    let apiService: DownloadAPIService;
    let cryptoService: DownloadCryptoService;
    let nodeKey: { key: object; contentKeyPacketSessionKey: string };
    let revision: DecryptedRevision;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        telemetry = {
            getLoggerForRevision: jest.fn().mockReturnValue({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            }),
            downloadInitFailed: jest.fn(),
            downloadFailed: jest.fn(),
            downloadFinished: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            iterateRevisionBlocks: jest.fn().mockImplementation(async function* () {
                yield { type: 'manifestSignature', armoredManifestSignature: 'manifestSignature' };
                yield { type: 'thumbnail', base64sha256Hash: 'aGFzaDA=' };
                yield { type: 'block', index: 1, bareUrl: 'url', token: 'token1', base64sha256Hash: 'aGFzaDE=' };
                yield { type: 'block', index: 2, bareUrl: 'url', token: 'token2', base64sha256Hash: 'aGFzaDI=' };
                yield { type: 'block', index: 3, bareUrl: 'url', token: 'token3', base64sha256Hash: 'aGFzaDM=' };
            }),
            getRevisionBlockToken: jest.fn().mockImplementation(async (_, blockIndex: number) => ({
                index: blockIndex,
                bareUrl: 'url',
                token: `token${blockIndex}-refreshed`,
                base64sha256Hash: `hash${blockIndex}`,
            })),
            // By default, return a block of length equal to the index number.
            downloadBlock: jest.fn().mockImplementation(mockBlockDownload),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            getRevisionKeys: jest.fn().mockImplementation(async () => ({
                key: 'privateKey',
                contentKeyPacketSessionKey: 'contentSessionKey',
                verificationKeys: 'verificationKeys',
            })),
            decryptBlock: jest.fn().mockImplementation(async (encryptedBlock) => encryptedBlock),
            verifyBlockIntegrity: jest.fn().mockResolvedValue(undefined),
            verifyManifest: jest.fn().mockResolvedValue(undefined),
        };

        nodeKey = {
            key: { _idx: 32131 },
            contentKeyPacketSessionKey: 'sessionKey',
        };

        revision = {
            uid: 'revisionUid',
            claimedSize: 1024,
            claimedBlockSizes: [16, 16, 16, 16],
        } as DecryptedRevision;
    });

    describe('writeToStream', () => {
        let onProgress: (downloadedBytes: number) => void;
        let onFinish: () => void;

        let downloader: FileDownloader;
        let writer: WritableStreamDefaultWriter<Uint8Array>;
        let stream: WritableStream<Uint8Array>;

        const verifySuccess = async (
            fileProgress: number = 6, // 3 blocks of length 1, 2, 3
        ) => {
            const controller = downloader.writeToStream(stream, onProgress);
            await controller.completion();

            expect(apiService.iterateRevisionBlocks).toHaveBeenCalledWith('revisionUid', undefined);
            expect(cryptoService.verifyManifest).toHaveBeenCalledTimes(1);
            expect(writer.close).toHaveBeenCalledTimes(1);
            expect(writer.abort).not.toHaveBeenCalled();
            expect(telemetry.downloadFinished).toHaveBeenCalledTimes(1);
            expect(telemetry.downloadFinished).toHaveBeenCalledWith('revisionUid', fileProgress);
            expect(telemetry.downloadFailed).not.toHaveBeenCalled();
            expect(onFinish).toHaveBeenCalledTimes(1);
        };

        const verifyFailure = async (error: string, downloadedBytes: number | undefined) => {
            const controller = downloader.writeToStream(stream, onProgress);

            await expect(controller.completion()).rejects.toThrow(error);

            expect(apiService.iterateRevisionBlocks).toHaveBeenCalledWith('revisionUid', undefined);
            expect(writer.close).not.toHaveBeenCalled();
            expect(writer.abort).toHaveBeenCalledTimes(1);
            expect(telemetry.downloadFinished).not.toHaveBeenCalled();
            expect(telemetry.downloadFailed).toHaveBeenCalledTimes(1);
            expect(telemetry.downloadFailed).toHaveBeenCalledWith(
                'revisionUid',
                new Error(error),
                downloadedBytes === undefined ? expect.anything() : downloadedBytes,
                revision.claimedSize,
            );
            expect(onFinish).toHaveBeenCalledTimes(1);
        };

        const verifyOnProgress = async (downloadedBytes: number[]) => {
            expect(onProgress).toHaveBeenCalledTimes(downloadedBytes.length);
            for (let i = 0; i < downloadedBytes.length; i++) {
                expect(onProgress).toHaveBeenNthCalledWith(i + 1, downloadedBytes[i]);
            }
        };

        beforeEach(() => {
            onProgress = jest.fn();
            onFinish = jest.fn();

            // @ts-expect-error Mocking WritableStreamDefaultWriter
            writer = {
                write: jest.fn(),
                close: jest.fn(),
                abort: jest.fn(),
            };
            // @ts-expect-error Mocking WritableStream
            stream = {
                getWriter: () => writer,
            };
            downloader = new FileDownloader(
                telemetry,
                apiService,
                cryptoService,
                nodeKey as any,
                revision,
                undefined,
                onFinish,
            );
        });

        it('should reject two download starts', async () => {
            downloader.writeToStream(stream, onProgress);
            expect(() => downloader.writeToStream(stream, onProgress)).toThrow('Download already started');
            expect(() => downloader.unsafeWriteToStream(stream, onProgress)).toThrow('Download already started');
        });

        it('should start a download and write to the stream', async () => {
            await verifySuccess();
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(3);
            expect(cryptoService.verifyBlockIntegrity).toHaveBeenCalledTimes(3);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(3);
            await verifyOnProgress([1, 2, 3]);
        });

        // Use over MAX_DOWNLOAD_BLOCK_SIZE blocks to test that the downloader is not stuck in a loop.
        it('should start a download and write to the stream with random order', async () => {
            let count = 0;
            // Keep first block with high timeout to make sure it is not finished first.
            const timeouts = [90, 50, 40, 80, 70, 60, 30, 20, 10, 90, 10];

            apiService.iterateRevisionBlocks = jest.fn().mockImplementation(async function* () {
                yield { type: 'manifestSignature', armoredManifestSignature: 'manifestSignature' };
                yield { type: 'thumbnail', base64sha256Hash: 'aGFzaDA=' };
                yield { type: 'block', index: 1, bareUrl: 'url', token: 'token1', base64sha256Hash: 'aGFzaDE=' };
                yield { type: 'block', index: 2, bareUrl: 'url', token: 'token2', base64sha256Hash: 'aGFzaDI=' };
                yield { type: 'block', index: 3, bareUrl: 'url', token: 'token3', base64sha256Hash: 'aGFzaDM=' };
                yield { type: 'block', index: 4, bareUrl: 'url', token: 'token1', base64sha256Hash: 'aGFzaDE=' };
                yield { type: 'block', index: 5, bareUrl: 'url', token: 'token2', base64sha256Hash: 'aGFzaDI=' };
                yield { type: 'block', index: 6, bareUrl: 'url', token: 'token3', base64sha256Hash: 'aGFzaDM=' };
                yield { type: 'block', index: 7, bareUrl: 'url', token: 'token1', base64sha256Hash: 'aGFzaDE=' };
                yield { type: 'block', index: 8, bareUrl: 'url', token: 'token2', base64sha256Hash: 'aGFzaDI=' };
                yield { type: 'block', index: 9, bareUrl: 'url', token: 'token3', base64sha256Hash: 'aGFzaDM=' };
                yield { type: 'block', index: 10, bareUrl: 'url', token: 'token1', base64sha256Hash: 'aGFzaDE=' };
                yield { type: 'block', index: 11, bareUrl: 'url', token: 'token2', base64sha256Hash: 'aGFzaDI=' };
            });
            apiService.downloadBlock = jest.fn().mockImplementation(async function (bareUrl, token, onProgress) {
                await new Promise((resolve) => setTimeout(resolve, timeouts[count++]));
                return mockBlockDownload(bareUrl, token, onProgress);
            });

            await verifySuccess(21); // Progress is 1 + 2 + 3 + 1 + 2 + 3 + 1 + 2 + 3 + 1 + 2 = 21
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(11);
            expect(cryptoService.verifyBlockIntegrity).toHaveBeenCalledTimes(11);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(11);
            expect(writer.write).toHaveBeenNthCalledWith(1, new Uint8Array([0]));
            expect(writer.write).toHaveBeenNthCalledWith(2, new Uint8Array([0, 1]));
            expect(writer.write).toHaveBeenNthCalledWith(3, new Uint8Array([0, 1, 2]));
            expect(writer.write).toHaveBeenNthCalledWith(4, new Uint8Array([0]));
            expect(writer.write).toHaveBeenNthCalledWith(5, new Uint8Array([0, 1]));
            expect(writer.write).toHaveBeenNthCalledWith(6, new Uint8Array([0, 1, 2]));
            expect(writer.write).toHaveBeenNthCalledWith(7, new Uint8Array([0]));
            expect(writer.write).toHaveBeenNthCalledWith(8, new Uint8Array([0, 1]));
            expect(writer.write).toHaveBeenNthCalledWith(9, new Uint8Array([0, 1, 2]));
            expect(writer.write).toHaveBeenNthCalledWith(10, new Uint8Array([0]));
            expect(writer.write).toHaveBeenNthCalledWith(11, new Uint8Array([0, 1]));
        });

        it('should handle failure when iterating blocks', async () => {
            apiService.iterateRevisionBlocks = jest.fn().mockImplementation(async function* () {
                throw new Error('Failed to iterate blocks');
            });

            await verifyFailure('Failed to iterate blocks', 0);
        });

        it('should handle failure when downloading block', async () => {
            apiService.downloadBlock = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to download block');
            });

            await verifyFailure('Failed to download block', 0);
        });

        it('should handle one time-off failure when downloading block', async () => {
            let count = 0;
            apiService.downloadBlock = jest.fn().mockImplementation(async function (bareUrl, token, onProgress) {
                if (count === 0) {
                    count++;
                    onProgress?.(1); // Simulate the failure happens after some progress.
                    throw new Error('Failed to download block');
                }
                return mockBlockDownload(bareUrl, token, onProgress);
            });

            await verifySuccess();
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(4);
            expect(cryptoService.verifyBlockIntegrity).toHaveBeenCalledTimes(3);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(3);
            await verifyOnProgress([1, -1, 1, 2, 3]);
        });

        it('should handle expired token when downloading block', async () => {
            let count = 0;
            apiService.downloadBlock = jest.fn().mockImplementation(async function (bareUrl, token, onProgress) {
                if (count === 0) {
                    count++;
                    throw new APIHTTPError('Expired token', HTTPErrorCode.NOT_FOUND);
                }
                return mockBlockDownload(bareUrl, token, onProgress);
            });

            await verifySuccess();
            expect(apiService.getRevisionBlockToken).toHaveBeenCalledTimes(1);
            expect(apiService.getRevisionBlockToken).toHaveBeenCalledWith('revisionUid', 1, undefined);
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(4);
            expect(cryptoService.verifyBlockIntegrity).toHaveBeenCalledTimes(3);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(3);
            await verifyOnProgress([1, 2, 3]);
        });

        it('should handle failure when veryfing block', async () => {
            cryptoService.verifyBlockIntegrity = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to verify block');
            });

            await verifyFailure('Failed to verify block', undefined);
        });

        it('should handle one time-off failure when veryfing block', async () => {
            let count = 0;
            cryptoService.verifyBlockIntegrity = jest.fn().mockImplementation(async function () {
                if (count === 0) {
                    count++;
                    throw new Error('Failed to verify block');
                }
            });

            await verifySuccess();
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(4);
            expect(cryptoService.verifyBlockIntegrity).toHaveBeenCalledTimes(4);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(3);
            await verifyOnProgress([1, -1, 1, 2, 3]);
        });

        it('should handle failure when decrypting block', async () => {
            cryptoService.decryptBlock = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to decrypt block');
            });

            await verifyFailure('Failed to decrypt block', undefined);
        });

        it('should handle one time-off failure when decrypting block', async () => {
            let count = 0;
            cryptoService.decryptBlock = jest.fn().mockImplementation(async function (encryptedBlock) {
                if (count === 0) {
                    count++;
                    throw new Error('Failed to decrypt block');
                }
                return encryptedBlock;
            });

            await verifySuccess();
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(4);
            expect(cryptoService.verifyBlockIntegrity).toHaveBeenCalledTimes(4);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(4);
            await verifyOnProgress([1, -1, 1, 2, 3]);
        });

        it('should handle failure when writing to the stream', async () => {
            writer.write = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to write data');
            });

            await verifyFailure('Failed to write data', undefined);
        });

        it('should handle one time-off failure when writing to the stream', async () => {
            let count = 0;
            writer.write = jest.fn().mockImplementation(async function () {
                if (count === 0) {
                    count++;
                    throw new Error('Failed to write data');
                }
            });

            await verifySuccess();
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(3);
            expect(cryptoService.verifyBlockIntegrity).toHaveBeenCalledTimes(3);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(3);
            await verifyOnProgress([1, 2, 3]);
        });

        it('should handle failure when veryfing manifest', async () => {
            cryptoService.verifyManifest = jest.fn().mockImplementation(async function () {
                throw new Error('Failed to verify manifest');
            });

            await verifyFailure('Failed to verify manifest', 6); // All blocks of length 1, 2, 3.
        });
    });

    describe('unsafeWriteToStream', () => {
        let onProgress: (downloadedBytes: number) => void;
        let onFinish: () => void;

        let downloader: FileDownloader;
        let writer: WritableStreamDefaultWriter<Uint8Array>;
        let stream: WritableStream<Uint8Array>;

        beforeEach(() => {
            onProgress = jest.fn();
            onFinish = jest.fn();

            // @ts-expect-error Mocking WritableStreamDefaultWriter
            writer = {
                write: jest.fn(),
                close: jest.fn(),
                abort: jest.fn(),
            };
            // @ts-expect-error Mocking WritableStream
            stream = {
                getWriter: () => writer,
            };
            downloader = new FileDownloader(
                telemetry,
                apiService,
                cryptoService,
                nodeKey as any,
                revision,
                undefined,
                onFinish,
            );
        });

        it('should skip verification steps', async () => {
            const controller = downloader.unsafeWriteToStream(stream, onProgress);
            await controller.completion();

            expect(apiService.iterateRevisionBlocks).toHaveBeenCalledWith('revisionUid', undefined);
            expect(cryptoService.verifyManifest).not.toHaveBeenCalled();
            expect(apiService.downloadBlock).toHaveBeenCalledTimes(3);
            expect(cryptoService.verifyBlockIntegrity).not.toHaveBeenCalled();
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(3);
            expect(writer.close).toHaveBeenCalledTimes(1);
            expect(writer.abort).not.toHaveBeenCalled();
            expect(telemetry.downloadFinished).toHaveBeenCalledTimes(1);
            expect(telemetry.downloadFinished).toHaveBeenCalledWith('revisionUid', 6); // 3 blocks of length 1, 2, 3.
            expect(telemetry.downloadFailed).not.toHaveBeenCalled();
            expect(onFinish).toHaveBeenCalledTimes(1);
        });
    });

    describe('getSeekableStream', () => {
        let onFinish: () => void;
        let downloader: FileDownloader;

        beforeEach(() => {
            apiService.downloadBlock = jest.fn().mockImplementation(async function (_, token) {
                const index = parseInt(token.slice(5, 6)) - 1;
                const data = new Uint8Array(16);
                for (let i = 0; i < data.length; i++) {
                    data[i] = index * 16 + i;
                }
                return data;
            });

            onFinish = jest.fn();

            downloader = new FileDownloader(
                telemetry,
                apiService,
                cryptoService,
                nodeKey as any,
                revision,
                undefined,
                onFinish,
            );
        });

        it('should read the stream', async () => {
            const stream = downloader.getSeekableStream();

            const data = await stream.read(32);
            expect(data.value).toEqual(
                new Uint8Array([
                    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
                    27, 28, 29, 30, 31,
                ]),
            );
            expect(data.done).toEqual(false);

            const data2 = await stream.read(32);
            expect(data2.value).toEqual(
                new Uint8Array([
                    32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
                    57, 58, 59, 60, 61, 62, 63,
                ]),
            );
            expect(data2.done).toEqual(false);

            const data3 = await stream.read(32);
            expect(data3.value).toEqual(new Uint8Array([]));
            expect(data3.done).toEqual(true);

            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(4);
            expect(cryptoService.decryptBlock).toHaveBeenCalledWith(expect.anything(), {
                key: 'privateKey',
                contentKeyPacketSessionKey: 'contentSessionKey',
                verificationKeys: 'verificationKeys',
            });
        });

        it('should read the stream with seeking', async () => {
            const stream = downloader.getSeekableStream();

            const data1 = await stream.read(5);
            expect(data1.value).toEqual(new Uint8Array([0, 1, 2, 3, 4]));
            expect(data1.done).toEqual(false);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(1);

            await stream.seek(10);

            // Seek withing first block, so no new block is downloaded.
            const data2 = await stream.read(5);
            expect(data2.value).toEqual(new Uint8Array([10, 11, 12, 13, 14]));
            expect(data2.done).toEqual(false);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(1);

            // Seek and read from second and third blocks.
            await stream.seek(30);

            const data3 = await stream.read(5);
            expect(data3.value).toEqual(new Uint8Array([30, 31, 32, 33, 34]));
            expect(data3.done).toEqual(false);
            expect(cryptoService.decryptBlock).toHaveBeenCalledTimes(3);

            expect(cryptoService.decryptBlock).toHaveBeenCalledWith(expect.anything(), {
                key: 'privateKey',
                contentKeyPacketSessionKey: 'contentSessionKey',
                verificationKeys: 'verificationKeys',
            });
        });
    });
});
