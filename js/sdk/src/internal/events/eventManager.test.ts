import { getMockLogger } from "../../tests/logger";
import { NotFoundAPIError } from "../apiService";
import { EventManager } from "./eventManager";

jest.useFakeTimers();

describe("EventManager", () => {
    let manager: EventManager<string>;
    
    const getLastEventIdMock = jest.fn();
    const getEventsMock = jest.fn();
    const updateLatestEventIdMock = jest.fn();
    const listenerMock = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        getLastEventIdMock.mockImplementation(() => Promise.resolve("eventId1"));
        getEventsMock.mockImplementation(() => Promise.resolve({
            lastEventId: "eventId2",
            more: false,
            refresh: false,
            events: ["event1", "event2"],
        }));

        manager = new EventManager(
            getMockLogger(),
            getLastEventIdMock,
            getEventsMock,
            updateLatestEventIdMock,
        );
        manager.addListener(listenerMock);
    });

    afterEach(async () => {
        await manager.stop();
    });

    it("should get latest event ID on first run only", async () => {
        await manager.start();
        expect(getLastEventIdMock).toHaveBeenCalledTimes(1);
        expect(getEventsMock).toHaveBeenCalledTimes(0);
        expect(listenerMock).toHaveBeenCalledTimes(0);
        expect(updateLatestEventIdMock).toHaveBeenCalledTimes(1);
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId1');
    });

    it("should notify about events in the next run", async () => {
        await manager.start();
        expect(getLastEventIdMock).toHaveBeenCalledTimes(1);
        expect(getEventsMock).toHaveBeenCalledTimes(0);
        expect(listenerMock).toHaveBeenCalledTimes(0);
        expect(updateLatestEventIdMock).toHaveBeenCalledTimes(1);
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId1');
        updateLatestEventIdMock.mockClear();
        await jest.runOnlyPendingTimersAsync();
        expect(getEventsMock).toHaveBeenCalledTimes(1);
        expect(listenerMock).toHaveBeenCalledTimes(1);
        expect(updateLatestEventIdMock).toHaveBeenCalledTimes(1);
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId2');
    });

    it("should continue with more events", async () => {
        getEventsMock.mockImplementation((lastEventId: string) => Promise.resolve({
            lastEventId: lastEventId === "eventId1" ? "eventId2" : "eventId3",
            more: lastEventId === "eventId1" ? true : false,
            refresh: false,
            events: lastEventId === "eventId1" ? ["event1", "event2"] : ["event3"],
        }));
        await manager.start();
        await jest.runOnlyPendingTimersAsync();
        expect(getEventsMock).toHaveBeenCalledTimes(2);
        expect(listenerMock).toHaveBeenCalledTimes(2);
        expect(listenerMock).toHaveBeenCalledWith(["event1", "event2"], false);
        expect(listenerMock).toHaveBeenCalledWith(["event3"], false);
        expect(updateLatestEventIdMock).toHaveBeenCalledTimes(3);
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId1');
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId2');
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId3');
    });

    it("should refresh if event does not exist", async () => {
        getEventsMock.mockImplementation(() => Promise.reject(new NotFoundAPIError('Event not found', 2501)));
        await manager.start();
        await jest.runOnlyPendingTimersAsync();
        expect(getLastEventIdMock).toHaveBeenCalledTimes(2);
        expect(listenerMock).toHaveBeenCalledTimes(1);
        expect(listenerMock).toHaveBeenCalledWith([], true);
        expect(updateLatestEventIdMock).toHaveBeenCalledTimes(1);
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId1');
    });

    it("should retry on error", async () => {
        let index = 0;
        getEventsMock.mockImplementation(() => {
            index++;
            if (index <= 3) {
                return Promise.reject(new Error("Error"));
            }
            return Promise.resolve({
                lastEventId: "eventId2",
                more: false,
                refresh: false,
                events: ["event1", "event2"],
            });
        });
        await manager.start();
        updateLatestEventIdMock.mockClear();

        // First failure.
        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(0);
        expect(manager.nextPollTimeout).toBe(30000);

        // Second failure.
        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(0);
        expect(manager.nextPollTimeout).toBe(60000);

        // Third failure.
        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(0);
        expect(manager.nextPollTimeout).toBe(90000);

        // And now it passes.
        await jest.runOnlyPendingTimersAsync();
        expect(listenerMock).toHaveBeenCalledTimes(1);
        expect(listenerMock).toHaveBeenCalledWith(["event1", "event2"], false);
        expect(updateLatestEventIdMock).toHaveBeenCalledTimes(1);
        expect(updateLatestEventIdMock).toHaveBeenCalledWith('eventId2');
    });

    it("should stop polling", async () => {
        await manager.start();
        await manager.stop();
        await jest.runOnlyPendingTimersAsync();
        expect(getEventsMock).toHaveBeenCalledTimes(0);
    });
});
