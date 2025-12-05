import {
    ProtonDriveEntitiesCache,
    ProtonDriveCryptoCache,
    ProtonDriveAccount,
    MemberRole,
    NodeType,
} from '../../interface';
import { DriveCrypto } from '../../crypto';
import { MemoryCache } from '../../cache';
import { getMockTelemetry } from '../../tests/telemetry';
import { DriveAPIService } from '../apiService';
import { DriveEventType } from '../events';
import { makeNodeUid } from '../uids';
import { SharesService, DecryptedNode } from './interface';
import { initNodesModule } from './index';
import { NodesCache } from './cache';
import { getMockLogger } from '../../tests/logger';

function generateNode(uid: string, parentUid = 'volumeId~root', params: Partial<DecryptedNode> = {}): DecryptedNode {
    return {
        uid,
        parentUid,
        directRole: MemberRole.Admin,
        type: NodeType.File,
        mediaType: 'text',
        isShared: false,
        isSharedPublicly: false,
        creationTime: new Date(),
        modificationTime: new Date(),
        trashTime: undefined,
        isStale: false,
        ...params,
    } as DecryptedNode;
}

describe('nodesModules integration tests', () => {
    let apiService: DriveAPIService;
    let driveEntitiesCache: ProtonDriveEntitiesCache;
    let driveCryptoCache: ProtonDriveCryptoCache;
    let account: ProtonDriveAccount;
    let driveCrypto: DriveCrypto;
    let sharesService: SharesService;
    let nodesModule: ReturnType<typeof initNodesModule>;
    let nodesCache: NodesCache;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {};
        driveEntitiesCache = new MemoryCache();
        driveCryptoCache = new MemoryCache();
        // @ts-expect-error No need to implement all methods for mocking
        account = {};
        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {};
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            getRootIDs: jest.fn().mockResolvedValue({ volumeId: 'volumeId' }),
        };

        nodesModule = initNodesModule(
            getMockTelemetry(),
            apiService,
            driveEntitiesCache,
            driveCryptoCache,
            account,
            driveCrypto,
            sharesService,
            'clientUid',
        );

        nodesCache = new NodesCache(getMockLogger(), driveEntitiesCache);
    });

    test('should move node from one folder to another after move event', async () => {
        // Prepare two folders (original and target) and a node in the original folder.
        const originalFolderUid = makeNodeUid('volumeId', 'originalFolder');
        const targetFolderUid = makeNodeUid('volumeId', 'targetFolder');
        const nodeUid = makeNodeUid('volumeId', 'node1');

        await nodesCache.setNode(generateNode(originalFolderUid));
        await nodesCache.setFolderChildrenLoaded(originalFolderUid);
        await nodesCache.setNode(generateNode(targetFolderUid));
        await nodesCache.setFolderChildrenLoaded(targetFolderUid);
        await nodesCache.setNode(generateNode(nodeUid, originalFolderUid));

        // Mock the API services to return the moved node.
        // This is called when listing the children of the target folder after
        // move event (when node marked as stale).
        apiService.post = jest.fn().mockImplementation(async (url, body) => {
            expect(url).toBe(`drive/v2/volumes/volumeId/links`);
            return {
                Links: [
                    {
                        Link: {
                            LinkID: 'node1',
                            ParentLinkID: 'targetFolder',
                            NameHash: 'hash',
                            Type: 2,
                        },
                        File: {
                            ActiveRevision: {},
                        },
                    },
                ],
            };
        });
        jest.spyOn(nodesModule.access, 'getParentKeys').mockResolvedValue({ key: { _idx: 32131 } } as any);

        // Verify the inital state before move event is sent.
        const originalBeforeMove = await Array.fromAsync(nodesModule.access.iterateFolderChildren(originalFolderUid));
        expect(originalBeforeMove).toMatchObject([{ uid: nodeUid, parentUid: originalFolderUid }]);

        const targetBeforeMove = await Array.fromAsync(nodesModule.access.iterateFolderChildren(targetFolderUid));
        expect(targetBeforeMove).toMatchObject([]);

        // Send the move event that updates the cache.
        await nodesModule.eventHandler.updateNodesCacheOnEvent({
            type: DriveEventType.NodeUpdated,
            nodeUid,
            parentNodeUid: targetFolderUid,
            isTrashed: false,
            isShared: false,
            treeEventScopeId: 'volumeId',
            eventId: '1',
        });

        // Verify the state after the move event, including when API service is called.
        const originalAfterMove = await Array.fromAsync(nodesModule.access.iterateFolderChildren(originalFolderUid));
        expect(originalAfterMove).toMatchObject([]);
        expect(apiService.post).not.toHaveBeenCalled();

        const targetAfterMove = await Array.fromAsync(nodesModule.access.iterateFolderChildren(targetFolderUid));
        expect(targetAfterMove).toMatchObject([{ uid: nodeUid, parentUid: targetFolderUid }]);
        expect(apiService.post).toHaveBeenCalledTimes(1);
    });
});
