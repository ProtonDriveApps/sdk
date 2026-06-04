import { type DriveEvent, DriveEventType, type DriveListener } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

import { Manager } from './manager';
import { MemoryEventsProvider } from './providerMemory';
import { NoEventsProvider } from './providerNoEvents';

describe('Manager', () => {
    const logger = getMockLogger();

    const driveDispose = jest.fn();
    let driveListener: DriveListener | undefined;
    const subscribeToDriveEvents = jest.fn(async (l: DriveListener) => {
        driveListener = l;
        return { dispose: driveDispose, getLatestEventId: jest.fn().mockResolvedValue('drive1') };
    });

    const treeDispose = jest.fn();
    let treeListener: DriveListener | undefined;
    const subscribeToTreeEvents = jest.fn(async (scope: string, l: DriveListener) => {
        treeListener = l;
        return { dispose: treeDispose, getLatestEventId: jest.fn().mockResolvedValue(`${scope}1`) };
    });

    const photosTreeDispose = jest.fn();
    const photosSubscribeToTreeEvents = jest.fn(async (scope: string) => {
        return { dispose: photosTreeDispose, getLatestEventId: jest.fn().mockResolvedValue(`photos-${scope}`) };
    });

    const driveSdk = {
        subscribeToDriveEvents,
        subscribeToTreeEvents,
    };

    const photosSdk = {
        subscribeToDriveEvents: jest.fn(async () => ({ dispose: jest.fn(), getLatestEventId: jest.fn() })),
        subscribeToTreeEvents: photosSubscribeToTreeEvents,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('create does not subscribe when no provider is used', async () => {
        await Manager.create(logger, driveSdk, photosSdk, new NoEventsProvider());

        expect(subscribeToDriveEvents).not.toHaveBeenCalled();
        expect(subscribeToTreeEvents).not.toHaveBeenCalled();
        expect(photosSubscribeToTreeEvents).not.toHaveBeenCalled();
    });

    it('create subscribes to drive and volume events', async () => {
        const provider = new MemoryEventsProvider();
        await provider.setLatestEventId('drive', 'vol', 'seed');

        await Manager.create(logger, driveSdk, photosSdk, provider);

        expect(subscribeToTreeEvents).toHaveBeenCalledWith('vol', expect.any(Function));
        expect(subscribeToDriveEvents).toHaveBeenCalledWith(expect.any(Function));

        await treeListener!(nodeCreated('vol', 'e1'));
        expect(await provider.getLatestEventId('vol')).toBe('e1');

        await driveListener!(nodeCreated('core', 'e2'));
        expect(await provider.getLatestEventId('core')).toBe('e2');
    });

    it('create does not treat core scope as a volume scope', async () => {
        const provider = new MemoryEventsProvider();
        await provider.setLatestEventId('drive', 'vol', 'vol-seed');
        await provider.setLatestEventId('drive', 'core', 'core-seed');

        await Manager.create(logger, driveSdk, photosSdk, provider);

        expect(subscribeToTreeEvents).toHaveBeenCalledWith('vol', expect.any(Function));
        expect(subscribeToTreeEvents).not.toHaveBeenCalledWith('core', expect.any(Function));
        expect(subscribeToDriveEvents).toHaveBeenCalledWith(expect.any(Function));
    });

    it('TreeRemove removes scope and disposes subscription', async () => {
        const provider = new MemoryEventsProvider();
        await provider.setLatestEventId('drive', 'vol', 'seed');

        await Manager.create(logger, driveSdk, photosSdk, provider);
        await treeListener!(nodeCreated('vol', 'e0'));
        await treeListener!({
            type: DriveEventType.TreeRemove,
            treeEventScopeId: 'vol',
            eventId: 'none',
        });

        expect(await provider.getLatestEventId('vol')).toBeNull();
        expect(treeDispose).toHaveBeenCalled();
    });

    it('subscribeDriveScope adds new scope', async () => {
        const provider = new MemoryEventsProvider();
        await provider.setLatestEventId('drive', 'vol', 'seed');

        const m = await Manager.create(logger, driveSdk, photosSdk, provider);
        await m.subscribeDriveScope('extra');

        expect(subscribeToTreeEvents).toHaveBeenCalledWith('extra', expect.any(Function));
        const driveScopeIds = provider.getInitialSubscriptionScopeIds()[0].treeEventScopeIds.sort();
        expect(driveScopeIds).toEqual(['core', 'extra', 'vol']);
    });

    it('subscribePhotosScope uses photos SDK', async () => {
        const provider = new MemoryEventsProvider();
        const m = await Manager.create(logger, driveSdk, photosSdk, provider);
        await m.subscribePhotosScope('photoVol');

        expect(photosSubscribeToTreeEvents).toHaveBeenCalledWith('photoVol', expect.any(Function));
    });
});

function nodeCreated(treeEventScopeId: string, eventId: string): DriveEvent {
    return {
        type: DriveEventType.NodeCreated,
        nodeUid: 'n',
        parentNodeUid: 'p',
        isTrashed: false,
        isShared: false,
        treeEventScopeId,
        eventId,
    };
}
