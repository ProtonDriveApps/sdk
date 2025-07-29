import { getMockLogger } from '../../tests/logger';
import { DriveEvent, DriveEventType } from '../events';
import { SharingCache } from './cache';
import { SharingAccess } from './sharingAccess';
import { SharingEventHandler } from './events';
import { SharesManager } from '../shares/manager';

// FIXME: test tree_refresh and tree_remove

describe('handleSharedByMeNodes', () => {
    let cache: SharingCache;
    let sharingEventHandler: SharingEventHandler;
    let sharesManager: SharesManager;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            addSharedByMeNodeUid: jest.fn(),
            removeSharedByMeNodeUid: jest.fn(),
            setSharedWithMeNodeUids: jest.fn(),
            getSharedByMeNodeUids: jest.fn().mockResolvedValue(['cachedNodeUid']),
        };
        sharesManager = {
            isOwnVolume: jest.fn(async (volumeId: string) => volumeId === 'MyVolume1'),
        } as any;
        sharingEventHandler = new SharingEventHandler(getMockLogger(), cache, sharesManager);
    });

    describe('node events trigger cache update', () => {
        it('should add if new own shared node is created', async () => {
            const event: DriveEvent = {
                eventId: '1',
                type: DriveEventType.NodeCreated,
                nodeUid: 'newNodeUid',
                parentNodeUid: 'parentUid',
                isTrashed: false,
                isShared: true,
                treeEventScopeId: 'MyVolume1',
            };
            await sharingEventHandler.handleDriveEvent(event);
            expect(cache.addSharedByMeNodeUid).toHaveBeenCalledWith('newNodeUid');
            expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
        });

        // FIXME enable when volume ownership is handled
        test.skip('should not add if new shared node is not own', async () => {
            const event: DriveEvent = {
                eventId: '1',
                type: DriveEventType.NodeCreated,
                nodeUid: 'newNodeUid',
                parentNodeUid: 'parentUid',
                isTrashed: false,
                isShared: true,
                treeEventScopeId: 'NotOwnVolume',
            };
            await sharingEventHandler.handleDriveEvent(event);
            expect(cache.addSharedByMeNodeUid).not.toHaveBeenCalled();
            expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
        });

        it('should not add if new own node is not shared', async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeCreated,
                nodeUid: 'newNodeUid',
                parentNodeUid: 'parentUid',
                isTrashed: false,
                isShared: false,
                eventId: '1',
                treeEventScopeId: 'MyVolume1',
            };
            await sharingEventHandler.handleDriveEvent(event);
            expect(cache.addSharedByMeNodeUid).not.toHaveBeenCalled();
            expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
        });

        it('should add if own node is updated and shared', async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: 'cachedNodeUid',
                parentNodeUid: 'parentUid',
                isTrashed: false,
                isShared: true,
                eventId: '1',
                treeEventScopeId: 'MyVolume1',
            };
            await sharingEventHandler.handleDriveEvent(event);
            expect(cache.addSharedByMeNodeUid).toHaveBeenCalledWith('cachedNodeUid');
            expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
        });

        it('should remove if shared node is un-shared', async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: 'cachedNodeUid',
                parentNodeUid: 'parentUid',
                isTrashed: false,
                isShared: false,
                eventId: '1',
                treeEventScopeId: 'MyVolume1',
            };
            await sharingEventHandler.handleDriveEvent(event);
            expect(cache.removeSharedByMeNodeUid).toHaveBeenCalledWith('cachedNodeUid');
            expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
        });

        it('should remove if shared node is deleted', async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeDeleted,
                nodeUid: 'cachedNodeUid',
                parentNodeUid: 'parentUid',
                eventId: '1',
                treeEventScopeId: 'MyVolume1',
            };
            await sharingEventHandler.handleDriveEvent(event);
            expect(cache.removeSharedByMeNodeUid).toHaveBeenCalledWith('cachedNodeUid');
            expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
        });
    });
});

describe('handleSharedWithMeNodes', () => {
    let cache: SharingCache;
    let sharingAccess: SharingAccess;
    let sharesManager: SharesManager;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getSharedWithMeNodeUids: jest.fn(),
            setSharedWithMeNodeUids: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharingAccess = {
            iterateSharedNodesWithMe: jest.fn(),
        };
        sharesManager = {
            isOwnVolume: jest.fn(async (volumeId: string) => volumeId === 'MyVolume1'),
        } as any;
    });

    it('should only update cache', async () => {
        const event: DriveEvent = {
            type: DriveEventType.SharedWithMeUpdated,
            eventId: 'event1',
            treeEventScopeId: 'core',
        };

        const sharingEventHandler = new SharingEventHandler(getMockLogger(), cache, sharesManager);
        await sharingEventHandler.handleDriveEvent(event);

        expect(cache.setSharedWithMeNodeUids).toHaveBeenCalledWith(undefined);
        expect(cache.getSharedWithMeNodeUids).not.toHaveBeenCalled();
        expect(sharingAccess.iterateSharedNodesWithMe).not.toHaveBeenCalled();
    });
});
