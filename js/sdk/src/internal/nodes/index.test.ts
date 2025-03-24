import { ProtonDriveEntitiesCache, ProtonDriveCryptoCache, ProtonDriveAccount, MemberRole, NodeType } from "../../interface";
import { DriveCrypto } from "../../crypto";
import { MemoryCache } from "../../cache";
import { getMockTelemetry } from "../../tests/telemetry";
import { DriveAPIService } from "../apiService";
import { DriveEventsService, DriveListener, DriveEvent, DriveEventType } from "../events";
import { makeNodeUid } from "../uids";
import { SharesService, DecryptedNode } from "./interface";
import { initNodesModule } from './index';

function generateSerializedNode(uid: string, parentUid = 'volumeId~root', params: Partial<DecryptedNode> = {}): string {
    return JSON.stringify(generateNode(uid, parentUid, params));
}

function generateNode(uid: string, parentUid = 'volumeId~root', params: Partial<DecryptedNode> = {}): DecryptedNode {
    return {
        uid,
        parentUid,
        directMemberRole: MemberRole.Admin,
        type: NodeType.File,
        mimeType: "text",
        isShared: false,
        createdDate: new Date(),
        trashedDate: undefined,
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
    let eventCallbacks: DriveListener[];
    let driveEvents: DriveEventsService;
    let sharesService: SharesService;
    let nodesModule: ReturnType<typeof initNodesModule>;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {}
        driveEntitiesCache = new MemoryCache();
        driveCryptoCache = new MemoryCache();
        // @ts-expect-error No need to implement all methods for mocking
        account = {}
        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {}
        eventCallbacks = [];
        // @ts-expect-error No need to implement all methods for mocking
        driveEvents = {
            addListener: jest.fn().mockImplementation((callback) => {
                eventCallbacks.push(callback);
            }),
        }
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {}

        nodesModule = initNodesModule(
            getMockTelemetry(),
            apiService,
            driveEntitiesCache,
            driveCryptoCache,
            account,
            driveCrypto,
            driveEvents,
            sharesService,
        );
    });

    test('should move node from one folder to another after move event', async () => {
        // Prepare two folders (original and target) and a node in the original folder.
        const originalFolderUid = makeNodeUid('volumeId', 'originalFolder');
        await driveEntitiesCache.setEntity(`node-${originalFolderUid}`, generateSerializedNode(originalFolderUid));
        await driveEntitiesCache.setEntity(`node-children-${originalFolderUid}`, 'loaded');

        const targetFolderUid = makeNodeUid('volumeId', 'targetFolder');
        await driveEntitiesCache.setEntity(`node-${targetFolderUid}`, generateSerializedNode(targetFolderUid));
        await driveEntitiesCache.setEntity(`node-children-${targetFolderUid}`, 'loaded');

        const nodeUid = makeNodeUid('volumeId', 'node1');
        await driveEntitiesCache.setEntity(`node-${nodeUid}`, generateSerializedNode(nodeUid, originalFolderUid), [`nodeParentUid:${originalFolderUid}`]);

        // Mock the API services to return the moved node.
        // This is called when listing the children of the target folder after
        // move event (when node marked as stale).
        apiService.post = jest.fn().mockImplementation(async (url, body) => {
            expect(url).toBe(`drive/v2/volumes/volumeId/links`);
            return {
                Links: [{
                    Link: {
                        LinkID: 'node1',
                        ParentLinkID: 'targetFolder',
                        NameHash: 'hash',
                        Type: 2,
                    },
                    File: {
                        ActiveRevision: {},
                    },
                }],
            };
        });
        jest.spyOn(nodesModule.access, 'getParentKeys').mockResolvedValue({key: 'privateKey'});

        // Verify the inital state before move event is sent.
        const originalBeforeMove = await Array.fromAsync(nodesModule.access.iterateChildren(originalFolderUid));
        expect(originalBeforeMove).toMatchObject([{ uid: nodeUid, parentUid: originalFolderUid }]);

        const targetBeforeMove = await Array.fromAsync(nodesModule.access.iterateChildren(targetFolderUid));
        expect(targetBeforeMove).toMatchObject([]);

        // Send the move event that updates the cache.
        const events: DriveEvent[] = [
            {
                type: DriveEventType.NodeUpdated,
                nodeUid,
                parentNodeUid: targetFolderUid,
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            },
        ]
        await Promise.all(eventCallbacks.map((callback) => callback(events)));

        // Verify the state after the move event, including when API service is called.
        const originalAfterMove = await Array.fromAsync(nodesModule.access.iterateChildren(originalFolderUid));
        expect(originalAfterMove).toMatchObject([]);
        expect(apiService.post).not.toHaveBeenCalled();

        const targetAfterMove = await Array.fromAsync(nodesModule.access.iterateChildren(targetFolderUid));
        expect(targetAfterMove).toMatchObject([{ uid: nodeUid, parentUid: targetFolderUid }]);
        expect(apiService.post).toHaveBeenCalledTimes(1);
    });
});
