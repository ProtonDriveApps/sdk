import { MemoryCache } from "../../cache";
import { EventsCache } from "./cache";

describe("EventsCache", () => {
    let memoryCache: MemoryCache<string>;
    let cache: EventsCache;

    beforeEach(() => {
        memoryCache = new MemoryCache();
        cache = new EventsCache(memoryCache);
    });

    it("should store and retrieve last event ID", async () => {
        const key = "volume1";
        await cache.setLastEventId(key, "eventId1", 0);
        await cache.setLastEventId(key, "eventId2", 0);
        const result = await cache.getLastEventId(key);
        expect(result).toBe("eventId2");
    });

    it("should store and retrieve polling interval", async () => {
        const key = "volume1";
        await cache.setLastEventId(key, "lastEventId", 10);
        await cache.setLastEventId(key, "lastEventId", 20);
        const result = await cache.getPollingIntervalInSeconds(key);
        expect(result).toBe(20);
    });

    it("should store and retrieve subscribed volume IDs", async () => {
        await cache.setLastEventId("volume1", "lastEventId", 0);
        await cache.setLastEventId("volume2", "lastEventId", 0);
        const result = await cache.getSubscribedVolumeIds();
        expect(result).toStrictEqual(["volume1", "volume2"]);
    });

    it("should not fail if cache is empty", async () => {
        const result = await cache.getLastEventId("volume1");
        expect(result).toBe(undefined);
    });

    it("should call cache only once", async () => {
        const spy = jest.spyOn(memoryCache, "getEntity");
        await cache.getLastEventId("volume1");
        await cache.getLastEventId("volume1");
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
