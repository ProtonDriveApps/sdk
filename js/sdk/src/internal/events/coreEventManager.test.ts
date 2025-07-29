import { getMockLogger } from '../../tests/logger';
import { EventsAPIService } from './apiService';
import { DriveEvent, DriveEventsListWithStatus, DriveEventType } from './interface';
import { CoreEventManager } from './coreEventManager';

describe('CoreEventManager', () => {
    let mockApiService: jest.Mocked<EventsAPIService>;
    let coreEventManager: CoreEventManager;
    const mockLogger = getMockLogger();

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        mockApiService = {
            getCoreLatestEventId: jest.fn(),
            getCoreEvents: jest.fn(),
            getVolumeLatestEventId: jest.fn(),
            getVolumeEvents: jest.fn(),
        } as unknown as jest.Mocked<EventsAPIService>;

        coreEventManager = new CoreEventManager(mockLogger, mockApiService);
    });

    describe('getLatestEventId', () => {
        it('should return the latest event ID from API service', async () => {
            const expectedEventId = 'event-123';
            mockApiService.getCoreLatestEventId.mockResolvedValue(expectedEventId);

            const result = await coreEventManager.getLatestEventId();

            expect(result).toBe(expectedEventId);
            expect(mockApiService.getCoreLatestEventId).toHaveBeenCalledTimes(1);
        });

        it('should handle API service errors', async () => {
            const error = new Error('API error');
            mockApiService.getCoreLatestEventId.mockRejectedValue(error);

            await expect(coreEventManager.getLatestEventId()).rejects.toThrow('API error');
            expect(mockApiService.getCoreLatestEventId).toHaveBeenCalledTimes(1);
        });
    });

    describe('getEvents', () => {
        const eventId = 'event1';
        const latestEventId = 'event2';

        it('should yield ShareWithMeUpdated event when refresh is true', async () => {
            const mockEvents: DriveEventsListWithStatus = {
                latestEventId,
                more: false,
                refresh: true,
                events: [],
            };
            mockApiService.getCoreEvents.mockResolvedValue(mockEvents);

            const events = [];
            for await (const event of coreEventManager.getEvents(eventId)) {
                events.push(event);
            }

            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
                type: DriveEventType.SharedWithMeUpdated,
                treeEventScopeId: 'core',
                eventId: latestEventId,
            });
            expect(mockApiService.getCoreEvents).toHaveBeenCalledWith(eventId);
        });

        it('should yield all events when there are actual events', async () => {
            const mockEvent1: DriveEvent = {
                type: DriveEventType.SharedWithMeUpdated,
                eventId: 'event-1',
                treeEventScopeId: 'core',
            };
            const mockEvent2: DriveEvent = {
                type: DriveEventType.SharedWithMeUpdated,
                eventId: 'event-2',
                treeEventScopeId: 'core',
            };
            const mockEvents: DriveEventsListWithStatus = {
                latestEventId,
                more: false,
                refresh: false,
                events: [mockEvent1, mockEvent2],
            };
            mockApiService.getCoreEvents.mockResolvedValue(mockEvents);

            const events = [];
            for await (const event of coreEventManager.getEvents(eventId)) {
                events.push(event);
            }

            expect(events).toHaveLength(2);
            expect(events[0]).toEqual(mockEvent1);
            expect(events[1]).toEqual(mockEvent2);
        });
    });
});
