import { getMockLogger } from '../../tests/logger';
import { EventManager } from './eventManager';
import { DriveEvent, DriveEventType, EventSubscription, UnsubscribeFromEventsSourceError } from './interface';

jest.useFakeTimers();

const POLLING_INTERVAL = 1;

describe('EventManager', () => {
    let manager: EventManager<DriveEvent>;

    const listenerMock = jest.fn();
    const subscriptions: EventSubscription[] = [];
    const mockEventManager = {
        getLogger: () => getMockLogger(),
        getLatestEventId: jest.fn(),
        getEvents: jest.fn(),
    };

    beforeEach(() => {
        manager = new EventManager(mockEventManager, POLLING_INTERVAL, null);
        const subscription = manager.addListener(listenerMock);
        subscriptions.push(subscription);
    });

    afterEach(async () => {
        await manager.stop();
        while (subscriptions.length > 0) {
            const subscription = subscriptions.pop();
            subscription?.dispose();
        }
        jest.clearAllMocks();
    });

    it('should start polling when started', async () => {
        mockEventManager.getLatestEventId.mockResolvedValue('EventId1');

        const mockEvents: DriveEvent[][] = [
            [
                {
                    type: DriveEventType.FastForward,
                    treeEventScopeId: 'volume1',
                    eventId: 'EventId2',
                },
            ],
            [
                {
                    type: DriveEventType.FastForward,
                    treeEventScopeId: 'volume1',
                    eventId: 'EventId3',
                },
            ],
        ];

        mockEventManager.getEvents
            .mockImplementationOnce(async function* () {
                yield* mockEvents[0];
            })
            .mockImplementationOnce(async function* () {
                yield* mockEvents[1];
            })
            .mockImplementationOnce(async function* () {});

        expect(mockEventManager.getLatestEventId).toHaveBeenCalledTimes(0);
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(0);

        expect(await manager.start()).toBeUndefined();
        await jest.runOnlyPendingTimersAsync();

        expect(mockEventManager.getLatestEventId).toHaveBeenCalledTimes(1);
        expect(mockEventManager.getEvents).toHaveBeenCalledWith('EventId1');

        await jest.runOnlyPendingTimersAsync();
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(2);
        expect(mockEventManager.getEvents).toHaveBeenCalledWith('EventId2');
    });

    it('should stop polling when stopped', async () => {
        mockEventManager.getLatestEventId.mockResolvedValue('eventId1');
        mockEventManager.getEvents.mockImplementation(async function* () {
            yield {
                type: DriveEventType.FastForward,
                treeEventScopeId: 'volume1',
                eventId: 'eventId1',
            };
        });

        await manager.start();
        await jest.runOnlyPendingTimersAsync();

        const callsBeforeStop = mockEventManager.getEvents.mock.calls.length;
        await manager.stop();
        await jest.runOnlyPendingTimersAsync();

        // Should not have made additional calls after stopping
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(callsBeforeStop);
    });

    it('should notify all listeners when getting events', async () => {
        mockEventManager.getLatestEventId.mockResolvedValue('eventId1');

        const mockEvents: DriveEvent[] = [
            {
                type: DriveEventType.NodeCreated,
                nodeUid: 'node1',
                parentNodeUid: 'parent1',
                isTrashed: false,
                isShared: false,
                treeEventScopeId: 'volume1',
                eventId: 'eventId2',
            },
        ];

        mockEventManager.getEvents
            .mockImplementationOnce(async function* () {
                yield* mockEvents;
            })
            .mockImplementation(async function* () {});

        expect(await manager.start()).toBeUndefined();
        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(1);
        expect(listenerMock).toHaveBeenNthCalledWith(1, mockEvents[0]);
    });

    it('should propagate unsubscription errors', async () => {
        mockEventManager.getLatestEventId.mockImplementation(() => {
            throw new UnsubscribeFromEventsSourceError('Not found');
        });

        await expect(manager.start()).rejects.toThrow(UnsubscribeFromEventsSourceError);

        expect(mockEventManager.getLatestEventId).toHaveBeenCalledTimes(1);
        expect(listenerMock).toHaveBeenCalledTimes(0);
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(0);
    });

    it('should continue processing multiple events', async () => {
        mockEventManager.getLatestEventId.mockResolvedValue('eventId1');

        const mockEvents: DriveEvent[] = [
            {
                type: DriveEventType.NodeCreated,
                nodeUid: 'node1',
                parentNodeUid: 'parent1',
                isTrashed: false,
                isShared: false,
                treeEventScopeId: 'volume1',
                eventId: 'eventId2',
            },
            {
                type: DriveEventType.NodeCreated,
                nodeUid: 'node2',
                parentNodeUid: 'parent1',
                isTrashed: false,
                isShared: false,
                treeEventScopeId: 'volume1',
                eventId: 'eventId3',
            },
        ];

        mockEventManager.getEvents
            .mockImplementationOnce(async function* () {
                yield* mockEvents;
            })
            .mockImplementation(async function* () {
                // Empty generator for subsequent calls
            });

        await manager.start();
        await jest.runOnlyPendingTimersAsync();

        expect(listenerMock).toHaveBeenCalledTimes(2);
        expect(listenerMock).toHaveBeenNthCalledWith(1, mockEvents[0]);
        expect(listenerMock).toHaveBeenNthCalledWith(2, mockEvents[1]);

        mockEventManager.getEvents.mockImplementationOnce(async function* () {
            yield* mockEvents;
        });
        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(4);
        expect(listenerMock).toHaveBeenNthCalledWith(1, mockEvents[0]);
        expect(listenerMock).toHaveBeenNthCalledWith(2, mockEvents[1]);
    });

    it('should retry on error with exponential backoff', async () => {
        mockEventManager.getLatestEventId.mockResolvedValue('eventId1');

        let callCount = 0;
        mockEventManager.getEvents.mockImplementation(async function* () {
            callCount++;
            if (callCount <= 3) {
                throw new Error('Network error');
            }
            yield {
                type: DriveEventType.FastForward,
                treeEventScopeId: 'volume1',
                eventId: 'eventId3',
            };
        });

        expect(manager['retryIndex']).toEqual(0);

        expect(await manager.start()).toBeUndefined();
        await jest.runOnlyPendingTimersAsync();
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(1);
        expect(manager['retryIndex']).toEqual(1);

        await jest.runOnlyPendingTimersAsync();
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(2);
        expect(manager['retryIndex']).toEqual(2);

        await jest.runOnlyPendingTimersAsync();
        expect(manager['retryIndex']).toEqual(3);

        expect(listenerMock).toHaveBeenCalledTimes(0);

        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(1);
        // After success, retry index should reset
        expect(manager['retryIndex']).toEqual(0);
    });

    it('should stop polling when stopped immediately', async () => {
        mockEventManager.getLatestEventId.mockResolvedValue('eventId1');
        mockEventManager.getEvents.mockImplementation(async function* () {
            yield {
                type: DriveEventType.FastForward,
                treeEventScopeId: 'volume1',
                eventId: 'eventId1',
            };
        });

        expect(await manager.start()).toBeUndefined();
        await jest.runOnlyPendingTimersAsync();
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(1);
        await manager.stop();
        await jest.runOnlyPendingTimersAsync();

        // getEvents should have been called once during start, but not again after stop
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(1);
    });

    it('should handle empty event streams', async () => {
        mockEventManager.getLatestEventId.mockResolvedValue('eventId1');

        mockEventManager.getEvents.mockImplementation(async function* () {
            // Empty generator - no events
        });

        await manager.start();
        await jest.runOnlyPendingTimersAsync();

        expect(listenerMock).toHaveBeenCalledTimes(0);
    });

    it('should poll right away after start if latestEventId is passed', async () => {
        manager = new EventManager(mockEventManager, POLLING_INTERVAL, 'eventId1');

        await manager.start();

        // Right after the start it is called.
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(1);
    });

    it('should not poll right away after start if latestEventId is not passed', async () => {
        manager = new EventManager(mockEventManager, POLLING_INTERVAL, null);

        await manager.start();

        // Right after the start it is not called.
        expect(mockEventManager.getEvents).not.toHaveBeenCalled();

        // But it is scheduled to be called after the polling interval.
        await jest.runOnlyPendingTimersAsync();
        expect(mockEventManager.getEvents).toHaveBeenCalledTimes(1);
    });
});
