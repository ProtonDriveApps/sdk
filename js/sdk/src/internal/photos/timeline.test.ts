import { getMockLogger } from '../../tests/logger';
import { DriveCrypto } from '../../crypto';
import { makeNodeUid } from '../uids';
import { PhotosAPIService } from './apiService';
import { PhotosNodesAccess } from './nodes';
import { PhotoSharesManager } from './shares';
import { PhotosTimeline } from './timeline';

describe('PhotosTimeline', () => {
    let logger: ReturnType<typeof getMockLogger>;
    let apiService: PhotosAPIService;
    let driveCrypto: DriveCrypto;
    let photoShares: PhotoSharesManager;
    let nodesService: PhotosNodesAccess;
    let timeline: PhotosTimeline;

    const volumeId = 'volumeId';
    const rootNodeId = 'rootNodeId';
    const rootNodeUid = makeNodeUid(volumeId, rootNodeId);
    const hashKey = new Uint8Array([1, 2, 3]);
    const name = 'photo.jpg';
    const nameHash = 'nameHash123';
    const sha1 = 'sha1Hash123';
    const contentHash = 'contentHash123';

    beforeEach(() => {
        logger = getMockLogger();
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            checkPhotoDuplicates: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {
            generateLookupHash: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        photoShares = {
            getRootIDs: jest.fn().mockResolvedValue({ volumeId, rootNodeId }),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {
            getNodeKeys: jest.fn().mockResolvedValue({ hashKey }),
        };

        timeline = new PhotosTimeline(logger, apiService, driveCrypto, photoShares, nodesService);
    });

    describe('findPhotoDuplicates', () => {
        it('should not call sha1 callback when there is no name hash match', async () => {
            const generateSha1 = jest.fn();
            apiService.checkPhotoDuplicates = jest.fn().mockResolvedValue([]);
            driveCrypto.generateLookupHash = jest.fn().mockResolvedValue(nameHash);

            const result = await timeline.findPhotoDuplicates(name, generateSha1);

            expect(result).toEqual([]);
            expect(generateSha1).not.toHaveBeenCalled();
            expect(photoShares.getRootIDs).toHaveBeenCalled();
            expect(nodesService.getNodeKeys).toHaveBeenCalledWith(rootNodeUid);
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith(name, hashKey);
            expect(apiService.checkPhotoDuplicates).toHaveBeenCalledWith(volumeId, [nameHash], undefined);
        });

        it('should call sha1 callback and not logger when name hash match but content hash does not', async () => {
            const generateSha1 = jest.fn().mockResolvedValue(sha1);
            const duplicates = [
                {
                    nameHash: nameHash,
                    contentHash: 'differentContentHash',
                    nodeUid: 'volumeId~node1',
                },
            ];
            apiService.checkPhotoDuplicates = jest.fn().mockResolvedValue(duplicates);
            driveCrypto.generateLookupHash = jest
                .fn()
                .mockResolvedValueOnce(nameHash)
                .mockResolvedValueOnce(contentHash);

            const result = await timeline.findPhotoDuplicates(name, generateSha1);

            expect(result).toEqual([]);
            expect(generateSha1).toHaveBeenCalledTimes(1);
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledTimes(2);
            expect(driveCrypto.generateLookupHash).toHaveBeenNthCalledWith(1, name, hashKey);
            expect(driveCrypto.generateLookupHash).toHaveBeenNthCalledWith(2, sha1, hashKey);
            expect(logger.debug).not.toHaveBeenCalled();
        });

        it('should call sha1 and logger when name and content hashes match', async () => {
            const generateSha1 = jest.fn().mockResolvedValue(sha1);
            const nodeUid1 = 'volumeId~node1';
            const duplicates = [
                {
                    nameHash: nameHash,
                    contentHash: contentHash,
                    nodeUid: nodeUid1,
                },
            ];
            apiService.checkPhotoDuplicates = jest.fn().mockResolvedValue(duplicates);
            driveCrypto.generateLookupHash = jest
                .fn()
                .mockResolvedValueOnce(nameHash)
                .mockResolvedValueOnce(contentHash);

            const result = await timeline.findPhotoDuplicates(name, generateSha1);

            expect(result).toEqual([nodeUid1]);
            expect(generateSha1).toHaveBeenCalledTimes(1);
            expect(logger.debug).toHaveBeenCalledTimes(1);
            expect(logger.debug).toHaveBeenCalledWith(
                `Duplicate photo found: name hash: ${nameHash}, content hash: ${contentHash}, node uids: ${nodeUid1}`,
            );
        });

        it('should return multiple node UIDs when multiple duplicates match', async () => {
            const generateSha1 = jest.fn().mockResolvedValue(sha1);
            const nodeUid1 = 'volumeId~node1';
            const nodeUid2 = 'volumeId~node2';
            const duplicates = [
                {
                    nameHash: nameHash,
                    contentHash: contentHash,
                    nodeUid: nodeUid1,
                },
                {
                    nameHash: nameHash,
                    contentHash: contentHash,
                    nodeUid: nodeUid2,
                },
            ];
            apiService.checkPhotoDuplicates = jest.fn().mockResolvedValue(duplicates);
            driveCrypto.generateLookupHash = jest
                .fn()
                .mockResolvedValueOnce(nameHash)
                .mockResolvedValueOnce(contentHash);

            const result = await timeline.findPhotoDuplicates(name, generateSha1);

            expect(result).toEqual([nodeUid1, nodeUid2]);
            expect(generateSha1).toHaveBeenCalledTimes(1);
            expect(logger.debug).toHaveBeenCalledTimes(1);
            expect(logger.debug).toHaveBeenCalledWith(
                `Duplicate photo found: name hash: ${nameHash}, content hash: ${contentHash}, node uids: ${nodeUid1},${nodeUid2}`,
            );
        });
    });
});

