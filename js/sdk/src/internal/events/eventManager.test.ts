import { getMockLogger } from '../../tests/logger';
import { EventManager } from './eventManager';
import { DriveEvent, DriveEventType, EventSubscription, UnsubscribeFromEventsSourceError } from './interface';

jest.useFakeTimers();

const POLLING_INTERVAL = 1;

describe('EventManager', () => {
    let manager: EventManager<DriveEvent>;

    const getLatestEventIdMock = jest.fn();
    const getEventsMock = jest.fn();
    const listenerMock = jest.fn();
    const mockLogger = getMockLogger();
    const subscriptions: EventSubscription[] = [];

    beforeEach(() => {
        const mockEventManager = {
            getLogger: () => mockLogger,
            getLatestEventId: getLatestEventIdMock,
            getEvents: getEventsMock,
        };

        manager = new EventManager(mockEventManager as any, POLLING_INTERVAL, null);
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
        getLatestEventIdMock.mockResolvedValue('EventId1');

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

        getEventsMock
            .mockImplementationOnce(async function* () {
                yield* mockEvents[0];
            })
            .mockImplementationOnce(async function* () {
                yield* mockEvents[1];
            })
            .mockImplementationOnce(async function* () {});

        expect(getLatestEventIdMock).toHaveBeenCalledTimes(0);
        expect(getEventsMock).toHaveBeenCalledTimes(0);

        expect(await manager.start()).toBeUndefined();

        expect(getLatestEventIdMock).toHaveBeenCalledTimes(1);
        expect(getEventsMock).toHaveBeenCalledWith('EventId1');

        await jest.runOnlyPendingTimersAsync();
        expect(getEventsMock).toHaveBeenCalledTimes(2);
        expect(getEventsMock).toHaveBeenCalledWith('EventId2');
    });

    it('should stop polling when stopped', async () => {
        getLatestEventIdMock.mockResolvedValue('eventId1');
        getEventsMock.mockImplementation(async function* () {
            yield {
                type: DriveEventType.FastForward,
                treeEventScopeId: 'volume1',
                eventId: 'eventId1',
            };
        });

        await manager.start();
        await jest.runOnlyPendingTimersAsync();

        const callsBeforeStop = getEventsMock.mock.calls.length;
        await manager.stop();
        await jest.runOnlyPendingTimersAsync();

        // Should not have made additional calls after stopping
        expect(getEventsMock).toHaveBeenCalledTimes(callsBeforeStop);
    });

    it('should notify all listeners when getting events', async () => {
        getLatestEventIdMock.mockResolvedValue('eventId1');

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

        getEventsMock
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
        getLatestEventIdMock.mockImplementation(() => {
            throw new UnsubscribeFromEventsSourceError('Not found');
        });

        await expect(manager.start()).rejects.toThrow(UnsubscribeFromEventsSourceError);

        expect(getLatestEventIdMock).toHaveBeenCalledTimes(1);
        expect(listenerMock).toHaveBeenCalledTimes(0);
        expect(getEventsMock).toHaveBeenCalledTimes(0);
    });

    it('should continue processing multiple events', async () => {
        getLatestEventIdMock.mockResolvedValue('eventId1');

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

        getEventsMock
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

        getEventsMock.mockImplementationOnce(async function* () {
            yield* mockEvents;
        });
        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(4);
        expect(listenerMock).toHaveBeenNthCalledWith(1, mockEvents[0]);
        expect(listenerMock).toHaveBeenNthCalledWith(2, mockEvents[1]);
    });

    it('should retry on error with exponential backoff', async () => {
        getLatestEventIdMock.mockResolvedValue('eventId1');

        let callCount = 0;
        getEventsMock.mockImplementation(async function* () {
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
        expect(getEventsMock).toHaveBeenCalledTimes(1);
        expect(manager['retryIndex']).toEqual(1);

        await jest.runOnlyPendingTimersAsync();
        expect(getEventsMock).toHaveBeenCalledTimes(2);
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
        getLatestEventIdMock.mockResolvedValue('eventId1');
        getEventsMock.mockImplementation(async function* () {
            yield {
                type: DriveEventType.FastForward,
                treeEventScopeId: 'volume1',
                eventId: 'eventId1',
            };
        });

        expect(await manager.start()).toBeUndefined();
        expect(getEventsMock).toHaveBeenCalledTimes(1);
        await manager.stop();
        await jest.runOnlyPendingTimersAsync();

        // getEvents should have been called once during start, but not again after stop
        expect(getEventsMock).toHaveBeenCalledTimes(1);
    });

    it('should handle empty event streams', async () => {
        getLatestEventIdMock.mockResolvedValue('eventId1');

        getEventsMock.mockImplementation(async function* () {
            // Empty generator - no events
        });

        await manager.start();
        await jest.runOnlyPendingTimersAsync();

        expect(listenerMock).toHaveBeenCalledTimes(0);
    });
});
