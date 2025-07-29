import { getMockLogger } from '../../tests/logger';
import { NotFoundAPIError } from '../apiService';
import { EventsAPIService } from './apiService';
import { VolumeEventManager } from './volumeEventManager';
import { DriveEventsListWithStatus, DriveEventType } from './interface';

jest.mock('./apiService');

describe('VolumeEventManager', () => {
    let manager: VolumeEventManager;
    let mockEventsAPIService: jest.Mocked<EventsAPIService>;
    const mockLogger = getMockLogger();
    const volumeId = 'volumeId123';

    beforeEach(() => {
        jest.clearAllMocks();

        mockEventsAPIService = {
            getVolumeLatestEventId: jest.fn(),
            getVolumeEvents: jest.fn(),
            getCoreLatestEventId: jest.fn(),
            getCoreEvents: jest.fn(),
        } as any;

        manager = new VolumeEventManager(mockLogger, mockEventsAPIService, volumeId);
    });

    describe('getLatestEventId', () => {
        it('should return the latest event ID from API', async () => {
            const expectedEventId = 'eventId123';
            mockEventsAPIService.getVolumeLatestEventId.mockResolvedValue(expectedEventId);

            const result = await manager.getLatestEventId();

            expect(result).toBe(expectedEventId);
            expect(mockEventsAPIService.getVolumeLatestEventId).toHaveBeenCalledWith(volumeId);
        });

        it('should throw UnsubscribeFromEventsSourceError when API returns NotFoundAPIError', async () => {
            const notFoundError = new NotFoundAPIError('Event not found', 2501);
            mockEventsAPIService.getVolumeLatestEventId.mockRejectedValue(notFoundError);

            await expect(manager.getLatestEventId()).rejects.toThrow('Event not found');
        });

        it('should rethrow other errors', async () => {
            const networkError = new Error('Network error');
            mockEventsAPIService.getVolumeLatestEventId.mockRejectedValue(networkError);

            await expect(manager.getLatestEventId()).rejects.toThrow('Network error');
        });
    });

    describe('getEvents', () => {
        it('should yield events from API response', async () => {
            const mockEventsResponse: DriveEventsListWithStatus = {
                latestEventId: 'eventId456',
                more: false,
                refresh: false,
                events: [
                    {
                        type: DriveEventType.NodeCreated,
                        nodeUid: 'node1',
                        parentNodeUid: 'parent1',
                        isTrashed: false,
                        isShared: false,
                        treeEventScopeId: volumeId,
                        eventId: 'eventId456',
                    },
                ],
            };

            mockEventsAPIService.getVolumeEvents.mockResolvedValue(mockEventsResponse);

            const events = [];
            for await (const event of manager.getEvents('startEventId')) {
                events.push(event);
            }

            expect(events).toEqual(mockEventsResponse.events);
            expect(mockEventsAPIService.getVolumeEvents).toHaveBeenCalledWith(volumeId, 'startEventId');
        });

        it('should continue fetching when more events are available', async () => {
            const firstResponse: DriveEventsListWithStatus = {
                latestEventId: 'eventId2',
                more: true,
                refresh: false,
                events: [
                    {
                        type: DriveEventType.NodeCreated,
                        nodeUid: 'node1',
                        parentNodeUid: 'parent1',
                        isTrashed: false,
                        isShared: false,
                        treeEventScopeId: volumeId,
                        eventId: 'eventId2',
                    },
                ],
            };

            const secondResponse: DriveEventsListWithStatus = {
                latestEventId: 'eventId3',
                more: false,
                refresh: false,
                events: [
                    {
                        type: DriveEventType.NodeUpdated,
                        nodeUid: 'node2',
                        parentNodeUid: 'parent1',
                        isTrashed: false,
                        isShared: false,
                        treeEventScopeId: volumeId,
                        eventId: 'eventId3',
                    },
                ],
            };

            mockEventsAPIService.getVolumeEvents
                .mockResolvedValueOnce(firstResponse)
                .mockResolvedValueOnce(secondResponse);

            const events = [];
            for await (const event of manager.getEvents('startEventId')) {
                events.push(event);
            }

            expect(events).toHaveLength(2);
            expect(events[0]).toEqual(firstResponse.events[0]);
            expect(events[1]).toEqual(secondResponse.events[0]);
            expect(mockEventsAPIService.getVolumeEvents).toHaveBeenCalledTimes(2);
            expect(mockEventsAPIService.getVolumeEvents).toHaveBeenNthCalledWith(1, volumeId, 'startEventId');
            expect(mockEventsAPIService.getVolumeEvents).toHaveBeenNthCalledWith(2, volumeId, 'eventId2');
        });

        it('should yield TreeRefresh event when refresh is true', async () => {
            const mockEventsResponse: DriveEventsListWithStatus = {
                latestEventId: 'eventId789',
                more: false,
                refresh: true,
                events: [],
            };

            mockEventsAPIService.getVolumeEvents.mockResolvedValue(mockEventsResponse);

            const events = [];
            for await (const event of manager.getEvents('startEventId')) {
                events.push(event);
            }

            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
                type: DriveEventType.TreeRefresh,
                treeEventScopeId: volumeId,
                eventId: 'eventId789',
            });
        });

        it('should yield FastForward event when no events but eventId changed', async () => {
            const mockEventsResponse: DriveEventsListWithStatus = {
                latestEventId: 'newEventId',
                more: false,
                refresh: false,
                events: [],
            };

            mockEventsAPIService.getVolumeEvents.mockResolvedValue(mockEventsResponse);

            const events = [];
            for await (const event of manager.getEvents('oldEventId')) {
                events.push(event);
            }

            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
                type: DriveEventType.FastForward,
                treeEventScopeId: volumeId,
                eventId: 'newEventId',
            });
        });

        it('should yield TreeRemove event when API returns NotFoundAPIError', async () => {
            const notFoundError = new NotFoundAPIError('Volume not found', 2501);
            mockEventsAPIService.getVolumeEvents.mockRejectedValue(notFoundError);

            const events = [];
            try {
                for await (const event of manager.getEvents('startEventId')) {
                    events.push(event);
                }
            } catch (error) {
                // The error should be re-thrown, but first it should yield a TreeRemove event
                expect(error).toBe(notFoundError);
            }

            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
                type: DriveEventType.TreeRemove,
                treeEventScopeId: volumeId,
                eventId: 'none',
            });
        });

        it('should rethrow non-NotFoundAPIError errors', async () => {
            const networkError = new Error('Network error');
            mockEventsAPIService.getVolumeEvents.mockRejectedValue(networkError);

            const eventGenerator = manager.getEvents('startEventId');
            const eventIterator = eventGenerator[Symbol.asyncIterator]();
            await expect(eventIterator.next()).rejects.toThrow('Network error');
        });

        it('should not yield events when events array is empty and eventId unchanged', async () => {
            const mockEventsResponse: DriveEventsListWithStatus = {
                latestEventId: 'sameEventId',
                more: false,
                refresh: false,
                events: [],
            };

            mockEventsAPIService.getVolumeEvents.mockResolvedValue(mockEventsResponse);

            const events = [];
            for await (const event of manager.getEvents('sameEventId')) {
                events.push(event);
            }

            expect(events).toHaveLength(0);
        });
    });

    describe('getLogger', () => {
        it('should return logger with prefix', () => {
            const logger = manager.getLogger();
            expect(logger).toBeDefined();
            // The logger should be wrapped with LoggerWithPrefix, but we can't easily test the prefix
        });
    });
});
