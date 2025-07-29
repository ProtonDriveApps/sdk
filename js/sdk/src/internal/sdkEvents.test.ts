import { SDKEvent } from '../interface';
import { SDKEvents } from './sdkEvents';

describe('SDKEvents', () => {
    let sdkEvents: SDKEvents;
    let logger: { debug: jest.Mock };

    beforeEach(() => {
        logger = { debug: jest.fn() };
        sdkEvents = new SDKEvents({ getLogger: () => logger } as any);
    });

    it('should log when no listeners are present for an event', () => {
        sdkEvents.requestsThrottled();

        expect(logger.debug).toHaveBeenCalledWith('No listeners for event: requestsThrottled');
    });

    it('should emit an event to its listeners', () => {
        const requestsThrottledListener = jest.fn();
        sdkEvents.addListener(SDKEvent.RequestsThrottled, requestsThrottledListener);
        const requestsUnthrottledListener = jest.fn();
        sdkEvents.addListener(SDKEvent.RequestsUnthrottled, requestsUnthrottledListener);

        sdkEvents.requestsThrottled();

        expect(requestsThrottledListener).toHaveBeenCalled();
        expect(requestsUnthrottledListener).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith('Emitting event: requestsThrottled');
    });

    it('should emit an event to multiple listeners', () => {
        const requestsThrottledListener1 = jest.fn();
        const requestsThrottledListener2 = jest.fn();
        sdkEvents.addListener(SDKEvent.RequestsThrottled, requestsThrottledListener1);
        sdkEvents.addListener(SDKEvent.RequestsThrottled, requestsThrottledListener2);

        sdkEvents.requestsThrottled();

        expect(requestsThrottledListener1).toHaveBeenCalled();
        expect(requestsThrottledListener2).toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith('Emitting event: requestsThrottled');
    });

    it('should not emit after unsubsribe', () => {
        const callback = jest.fn();
        const unsubscribe = sdkEvents.addListener(SDKEvent.RequestsThrottled, callback);

        sdkEvents.requestsThrottled();
        unsubscribe();
        sdkEvents.requestsThrottled();

        expect(callback).toHaveBeenCalledTimes(1);
    });
});
