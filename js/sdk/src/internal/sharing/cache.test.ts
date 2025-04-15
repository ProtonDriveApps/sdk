import { MemoryCache } from "../../cache";
import { SharingCache } from "./cache";

describe("SharingCache", () => {
    let memoryCache: MemoryCache<string>;
    let cache: SharingCache;

    beforeEach(() => {
        memoryCache = new MemoryCache();
        cache = new SharingCache(memoryCache);
    });

    describe("set and get shared by me nodes", () => {
        it("should set node uids", async () => {
            await cache.setSharedByMeNodeUids(["nodeUid"]);

            const result = await cache.getSharedByMeNodeUids();

            expect(result).toEqual(["nodeUid"]);
        });
    });

    describe("addSharedByMeNodeUid", () => {
        it("should throw if adding before setting", async () => {
            try {
                await cache.addSharedByMeNodeUid("nodeUid");
                fail("Should have thrown an error");
            } catch (error) {
                expect(`${error}`).toBe("Error: Calling add before setting the loaded items");
            }
        });

        it("should add node uid", async () => {
            await cache.setSharedByMeNodeUids(["nodeUid"]);
            const spy = jest.spyOn(memoryCache, 'setEntity');

            await cache.addSharedByMeNodeUid("newNodeUid");

            const result = await cache.getSharedByMeNodeUids();
            expect(result).toEqual(["nodeUid", "newNodeUid"]);
            expect(spy).toHaveBeenCalled();
        });

        it("should not add duplicate node uid", async () => {
            await cache.setSharedByMeNodeUids(["nodeUid"]);
            const spy = jest.spyOn(memoryCache, 'setEntity');

            await cache.addSharedByMeNodeUid("nodeUid");
            await cache.addSharedByMeNodeUid("nodeUid");

            const result = await cache.getSharedByMeNodeUids();
            expect(result).toEqual(["nodeUid"]);
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe("removeSharedByMeNodeUid", () => {
        it("should throw if removing before setting", async () => {
            try {
                await cache.removeSharedByMeNodeUid("nodeUid");
                fail("Should have thrown an error");
            } catch (error) {
                expect(`${error}`).toBe("Error: Calling remove before setting the loaded items");
            }
        });

        it("should remove node uid", async () => {
            await cache.setSharedByMeNodeUids(["nodeUid"]);
            const spy = jest.spyOn(memoryCache, 'setEntity');

            await cache.removeSharedByMeNodeUid("nodeUid");

            const result = await cache.getSharedByMeNodeUids();
            expect(result).toEqual([]);
            expect(spy).toHaveBeenCalled();
        });

        it("should handle removing of missing node uid", async () => {
            await cache.setSharedByMeNodeUids([]);
            const spy = jest.spyOn(memoryCache, 'setEntity');

            await cache.removeSharedByMeNodeUid("nodeUid");

            const result = await cache.getSharedByMeNodeUids();
            expect(result).toEqual([]);
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe("set and get shared with me nodes", () => {
        it("should set node uids", async () => {
            await cache.setSharedWithMeNodeUids(["nodeUid"]);

            const result = await cache.getSharedWithMeNodeUids();

            expect(result).toEqual(["nodeUid"]);
        });
    });
});
