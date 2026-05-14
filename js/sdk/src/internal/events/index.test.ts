import { getMockTelemetry } from '../../tests/telemetry';
import { DriveAPIService } from '../apiService';
import { CoreApiEvent } from './apiService';
import { DriveEventsService } from './index';
import { DriveEventType, DriveListener } from './interface';

describe('DriveEventsService', () => {
    describe('processCoreEvent', () => {
        function createService(cacheEventListeners: DriveListener[] = []) {
            const telemetry = getMockTelemetry();
            const apiService = {} as unknown as DriveAPIService;
            const sharesService = { isOwnVolume: jest.fn() };
            return new DriveEventsService(telemetry, apiService, sharesService, cacheEventListeners);
        }

        it('returns no drive events and does not notify listeners when the raw event is not a refresh', async () => {
            const listener: jest.MockedFunction<DriveListener> = jest.fn().mockResolvedValue(undefined);
            const service = createService([listener]);
            const raw = {
                EventID: 'event-no-refresh',
                Refresh: 0,
            } as CoreApiEvent;

            const result = await service.processCoreEvent(raw);

            expect(result).toEqual([]);
            expect(listener).not.toHaveBeenCalled();
        });

        it('returns SharedWithMeUpdated when Refresh is non-zero', async () => {
            const service = createService();
            const raw = {
                EventID: 'event-refresh',
                Refresh: 255,
            } as CoreApiEvent;

            const result = await service.processCoreEvent(raw);

            expect(result).toEqual([
                {
                    type: DriveEventType.SharedWithMeUpdated,
                    eventId: 'event-refresh',
                    treeEventScopeId: 'core',
                },
            ]);
        });

        it('returns SharedWithMeUpdated when DriveShareRefresh.Action is 2', async () => {
            const service = createService();
            const raw = {
                EventID: 'event-share-refresh',
                Refresh: 0,
                DriveShareRefresh: { Action: 2 },
            } as CoreApiEvent;

            const result = await service.processCoreEvent(raw);

            expect(result).toEqual([
                {
                    type: DriveEventType.SharedWithMeUpdated,
                    eventId: 'event-share-refresh',
                    treeEventScopeId: 'core',
                },
            ]);
        });
    });
});
