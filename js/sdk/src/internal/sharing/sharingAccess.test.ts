import { SharingAPIService } from "./apiService";
import { SharingCache } from "./cache";
import { SharesService, NodesService } from "./interface";

import { SharingAccess } from "./sharingAccess";

describe("SharingAccess", () => {
    let apiService: SharingAPIService;
    let cache: SharingCache;
    let sharesService: SharesService;
    let nodesService: NodesService;

    let sharingAccess: SharingAccess;

    const nodeUids = Array.from({ length: 15 }, (_, i) => `nodeUid${i}`);
    const nodes = nodeUids.map((nodeUid) => ({ nodeUid }));
    const nodeUidsIterator = async function* () {
        for (const nodeUid of nodeUids) {
            yield nodeUid;
        }
    }

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            iterateSharedNodeUids: jest.fn().mockImplementation(() => nodeUidsIterator()),
            iterateSharedWithMeNodeUids: jest.fn().mockImplementation(() => nodeUidsIterator()),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            setSharedByMeNodeUids: jest.fn(),
            setSharedWithMeNodeUids: jest.fn(),
        }
        sharesService = {
            getMyFilesIDs: jest.fn().mockResolvedValue({ volumeId: "volumeId" }),
        }
        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {
            iterateNodes: jest.fn().mockImplementation(async function* (nodeUids) {
                for (const node of nodes) {
                    if (nodeUids.includes(node.nodeUid)) {
                        yield node;
                    }
                }
            }),
        }

        sharingAccess = new SharingAccess(apiService, cache, sharesService, nodesService);
    });

    describe("iterateSharedNodes", () => {
        it("should iterate from cache", async () => {
            cache.getSharedByMeNodeUids = jest.fn().mockResolvedValue(nodeUids);

            const result = await Array.fromAsync(sharingAccess.iterateSharedNodes());

            expect(result).toEqual(nodes);
            expect(apiService.iterateSharedNodeUids).not.toHaveBeenCalled();
            expect(cache.setSharedByMeNodeUids).not.toHaveBeenCalled();
        });

        it("should iterate from API", async () => {
            cache.getSharedByMeNodeUids = jest.fn().mockRejectedValue(new Error('Not cached'));

            const result = await Array.fromAsync(sharingAccess.iterateSharedNodes());

            expect(result).toEqual(nodes);
            expect(apiService.iterateSharedNodeUids).toHaveBeenCalledWith("volumeId", undefined);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(2); // 15 / 10 per batch
            expect(cache.setSharedByMeNodeUids).toHaveBeenCalledWith(nodeUids);
        });
    });

    describe("iterateSharedNodesWithMe", () => {
        it("should iterate from cache", async () => {
            cache.getSharedWithMeNodeUids = jest.fn().mockResolvedValue(nodeUids);

            const result = await Array.fromAsync(sharingAccess.iterateSharedNodesWithMe());

            expect(result).toEqual(nodes);
            expect(apiService.iterateSharedWithMeNodeUids).not.toHaveBeenCalled();
            expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
        });

        it("should iterate from API", async () => {
            cache.getSharedWithMeNodeUids = jest.fn().mockRejectedValue(new Error('Not cached'));

            const result = await Array.fromAsync(sharingAccess.iterateSharedNodesWithMe());

            expect(result).toEqual(nodes);
            expect(apiService.iterateSharedWithMeNodeUids).toHaveBeenCalledWith(undefined);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(2); // 15 / 10 per batch
            expect(cache.setSharedWithMeNodeUids).toHaveBeenCalledWith(nodeUids);
        });
    });
});
