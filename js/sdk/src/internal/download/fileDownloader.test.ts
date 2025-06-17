import { Revision } from '../../interface';
import { FileDownloader } from './fileDownloader';
import { DownloadTelemetry } from './telemetry';
import { DownloadAPIService } from './apiService';
import { DownloadCryptoService } from './cryptoService';
import { DownloadController } from './controller';
import { APIHTTPError, HTTPErrorCode } from '../apiService';

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
    let controller: DownloadController;
    let nodeKey: { key: object; contentKeyPacketSessionKey: string };
    let revision: Revision;

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
        controller = new DownloadController();

        nodeKey = {
            key: {_idx: 32131},
            contentKeyPacketSessionKey: 'sessionKey',
        };

        revision = {
            uid: 'revisionUid',
            claimedSize: 1024,
        } as Revision;
    });
    
    describe('writeToStream', () => {
        let onProgress: (downloadedBytes: number) => void;
        let onFinish: () => void;

        let downloader: FileDownloader;
        let writer: WritableStreamDefaultWriter<Uint8Array>;
        let stream: WritableStream<Uint8Array>;

        const verifySuccess = async () => {
            const controller = downloader.writeToStream(stream, onProgress);
            await controller.completion();

            expect(apiService.iterateRevisionBlocks).toHaveBeenCalledWith('revisionUid', undefined);
            expect(cryptoService.verifyManifest).toHaveBeenCalledTimes(1);
            expect(writer.close).toHaveBeenCalledTimes(1);
            expect(writer.abort).not.toHaveBeenCalled();
            expect(telemetry.downloadFinished).toHaveBeenCalledTimes(1);
            expect(telemetry.downloadFinished).toHaveBeenCalledWith('revisionUid', 6); // 3 blocks of length 1, 2, 3.
            expect(telemetry.downloadFailed).not.toHaveBeenCalled();
            expect(onFinish).toHaveBeenCalledTimes(1);
        }

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
            }
            // @ts-expect-error Mocking WritableStream
            stream = {
                getWriter: () => writer,
            }
            downloader = new FileDownloader(telemetry, apiService, cryptoService, nodeKey, revision, undefined, onFinish);
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
            }
            // @ts-expect-error Mocking WritableStream
            stream = {
                getWriter: () => writer,
            }
            downloader = new FileDownloader(telemetry, apiService, cryptoService, nodeKey, revision, undefined, onFinish);
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
});
