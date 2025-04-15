import { ProtonDriveTelemetry } from '../../interface';
import { getMockTelemetry } from "../../tests/telemetry";
import { ThumbnailDownloader } from './thumbnailDownloader';
import { DownloadAPIService } from './apiService';
import { DownloadCryptoService } from './cryptoService';
import { NodesService } from './interface';

describe('ThumbnailDownloader', () => {
    let telemetry: ProtonDriveTelemetry;
    let nodesService: NodesService;
    let apiService: DownloadAPIService;
    let cryptoService: DownloadCryptoService;
    let downloader: ThumbnailDownloader;

    beforeEach(() => {
        telemetry = getMockTelemetry();

        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {
            iterateNodes: jest.fn().mockImplementation(async function* (nodeUids: string[]) {
                for (const nodeUid of nodeUids) {
                    yield {
                        uid: nodeUid,
                        type: 'file',
                        activeRevision: {
                            ok: true,
                            value: {
                                thumbnails: [{ type: 1, uid: `thumb-${nodeUid}` }],
                            },
                        },
                    }
                }
            }),
            getNodeKeys: jest.fn().mockReturnValue({
                contentKeyPacketSessionKey: 'contentKeyPacketSessionKey',
            }),
        } as NodesService;

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            iterateThumbnails: jest.fn().mockImplementation(async function* (thumbnailUids: string[]) {
                for (const thumbnailUid of thumbnailUids) {
                    yield {
                        uid: thumbnailUid,
                        ok: true,
                        bareUrl: `url-${thumbnailUid}`,
                        token: `token-${thumbnailUid}`,
                    }
                }
            }),
            downloadBlock: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        } as DownloadAPIService;

        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            decryptThumbnail: jest.fn().mockImplementation(async (thumbnail: Uint8Array) => thumbnail),
        } as DownloadCryptoService;

        downloader = new ThumbnailDownloader(telemetry, nodesService, apiService, cryptoService);
    });

    it('should handle all success cases', async () => {
        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1', 'node2', 'node3']));

        expect(results).toEqual([
            { nodeUid: 'node1', ok: true, thumbnail: new Uint8Array([1, 2, 3]) },
            { nodeUid: 'node2', ok: true, thumbnail: new Uint8Array([1, 2, 3]) },
            { nodeUid: 'node3', ok: true, thumbnail: new Uint8Array([1, 2, 3]) },
        ]);
        expect(nodesService.iterateNodes).toHaveBeenCalledWith(['node1', 'node2', 'node3'], undefined);
        expect(apiService.iterateThumbnails).toHaveBeenCalledWith(['thumb-node1', 'thumb-node2', 'thumb-node3'], undefined);
        expect(nodesService.getNodeKeys).toHaveBeenCalledTimes(3);
        expect(apiService.downloadBlock).toHaveBeenCalledTimes(3);
        expect(cryptoService.decryptThumbnail).toHaveBeenCalledTimes(3);
        expect(cryptoService.decryptThumbnail).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'contentKeyPacketSessionKey');
    });

    it('should handle no requested node', async () => {
        const results = await Array.fromAsync(downloader.iterateThumbnails([]));

        expect(results).toEqual([]);
        expect(nodesService.iterateNodes).not.toHaveBeenCalled();
        expect(apiService.iterateThumbnails).not.toHaveBeenCalled();
    });

    it('should handle failure when requesting nodes', async () => {
        nodesService.iterateNodes = jest.fn().mockImplementation(() => {
            throw new Error('Failed to fetch nodes');
        });

        const results = Array.fromAsync(downloader.iterateThumbnails(['node1']));
        await expect(results).rejects.toThrow('Failed to fetch nodes');
        expect(apiService.iterateThumbnails).not.toHaveBeenCalled();
    });

    it('should handle missing node', async () => {
        nodesService.iterateNodes = jest.fn().mockImplementation(async function* () {
            yield { missingUid: 'node1' };
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Node not found' }]);
        expect(apiService.iterateThumbnails).not.toHaveBeenCalled();
    });

    it('should handle node that is not a file', async () => {
        nodesService.iterateNodes = jest.fn().mockImplementation(async function* () {
            yield { uid: 'node1', type: 'folder' };
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Node is not a file' }]);
        expect(apiService.iterateThumbnails).not.toHaveBeenCalled();
    });


    it('should handle node without requested thumbnail', async () => {
        nodesService.iterateNodes = jest.fn().mockImplementation(async function* () {
            yield { uid: 'node1', type: 'file', activeRevision: { ok: true, value: { thumbnails: [] } } };
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Node has no thumbnail' }]);
        expect(apiService.iterateThumbnails).not.toHaveBeenCalled();
    });

    it('should handle API failure to provide token for thumbnail', async () => {
        apiService.iterateThumbnails = jest.fn().mockImplementation(async function* () {
            yield { uid: 'thumb-node1', ok: false, error: 'Failed to fetch token' };
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Failed to fetch token' }]);
        expect(apiService.downloadBlock).not.toHaveBeenCalled();
    });

    it('should handle API providing unexpected thumbnail', async () => {
        apiService.iterateThumbnails = jest.fn().mockImplementation(async function* () {
            yield { uid: 'thumb-unexpected', ok: true, thumbnail: new Uint8Array([1, 2, 3]) };
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Thumbnail not found' }]);
        expect(apiService.downloadBlock).not.toHaveBeenCalled();
    });

    it('should handle failure when downloading block', async () => {
        apiService.downloadBlock = jest.fn().mockRejectedValue(new Error('Failed to download thumbnail'));

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Failed to download thumbnail' }]);
        expect(apiService.downloadBlock).toHaveBeenCalledTimes(3);
    });

    it('should handle one-off failure when downloading block', async () => {
        let callCount = 0;
        apiService.downloadBlock = jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(new Error('Failed to download block'));
            }
            return Promise.resolve(new Uint8Array([1, 2, 3]));
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: true, thumbnail: new Uint8Array([1, 2, 3]) }]);
        expect(apiService.downloadBlock).toHaveBeenCalledTimes(2);
    });

    it('should handle failure when getting node keys', async () => {
        nodesService.getNodeKeys = jest.fn().mockRejectedValue(new Error('Failed to get node keys'));

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Failed to get node keys' }]);
        expect(apiService.downloadBlock).toHaveBeenCalledTimes(3);
    });

    it('should handle one-off failure when getting node keys', async () => {
        let callCount = 0;
        nodesService.getNodeKeys = jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(new Error('Failed to get node keys'));
            }
            return Promise.resolve({ contentKeyPacketSessionKey: 'contentKeyPacketSessionKey' });
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: true, thumbnail: new Uint8Array([1, 2, 3]) }]);
        expect(apiService.downloadBlock).toHaveBeenCalledTimes(2);
    });

    it('should handle failure when decrypting block', async () => {
        cryptoService.decryptThumbnail = jest.fn().mockRejectedValue(new Error('Failed to decrypt thumbnail'));

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: false, error: 'Failed to decrypt thumbnail' }]);
        expect(apiService.downloadBlock).toHaveBeenCalledTimes(3);
    });

    it('should handle one-off failure when decrypting block', async () => {
        let callCount = 0;
        cryptoService.decryptThumbnail = jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(new Error('Failed to decrypt thumbnail'));
            }
            return Promise.resolve(new Uint8Array([1, 2, 3]));
        });

        const results = await Array.fromAsync(downloader.iterateThumbnails(['node1']));

        expect(results).toEqual([{ nodeUid: 'node1', ok: true, thumbnail: new Uint8Array([1, 2, 3]) }]);
        expect(apiService.downloadBlock).toHaveBeenCalledTimes(2);
    });
});
