import { DriveEvent, DriveEventType } from "../events";
import { SharesService, NodesService, SharingType } from "./interface";
import { SharingCache } from "./cache";
import { handleSharedByMeNodes, handleSharedWithMeNodes } from "./events";
import { SharingAccess } from "./sharingAccess";

describe("handleSharedByMeNodes", () => {
    let cache: SharingCache;
    let nodesService: NodesService;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            addSharedByMeNodeUid: jest.fn(),
            removeSharedByMeNodeUid: jest.fn(),
            setSharedWithMeNodeUids: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {
            getNode: jest.fn().mockResolvedValue({ uid: 'nodeUid' }),
        };
    });

    const testCases: { 
        title: string,
        existingNodeUids: string[],
        event: DriveEvent,
        added: boolean,
        removed: boolean,
    }[] = [
        {
            title: "should add if new own shared node is created",
            existingNodeUids: [],
            event: {
                type: DriveEventType.NodeCreated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: true,
                isOwnVolume: true,
            },
            added: true,
            removed: false,
        },
        {
            title: "should not add if new shared node is not own",
            existingNodeUids: [],
            event: {
                type: DriveEventType.NodeCreated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: true,
                isOwnVolume: false,
            },
            added: false,
            removed: false,
        },
        {
            title: "should not add if new own node is not shared",
            existingNodeUids: [],
            event: {
                type: DriveEventType.NodeCreated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            },
            added: false,
            removed: false,
        },
        {
            title: "should add if own node is updated and shared",
            existingNodeUids: [],
            event: {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: true,
                isOwnVolume: true,
            },
            added: true,
            removed: false,
        },
        {
            title: "should add/update if shared node is updated",
            existingNodeUids: ["nodeUid"],
            event: {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: true,
                isOwnVolume: true,
            },
            added: true,
            removed: false,
        },
        {
            title: "should remove if shared node is un-shared",
            existingNodeUids: ["nodeUid"],
            event: {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            },
            added: false,
            removed: true,
        },
        {
            title: "should not remove if non-shared node is updated",
            existingNodeUids: [],
            event: {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            },
            added: false,
            removed: false,
        },
        {
            title: "should remove if shared node is deleted",
            existingNodeUids: ["nodeUid"],
            event: {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            },
            added: false,
            removed: true,
        },
        {
            title: "should not remove if non-shared node is deleted",
            existingNodeUids: [],
            event: {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            },
            added: false,
            removed: false,
        },
    ];

    describe("with listeners", () => {
        testCases.map(({ title, existingNodeUids, event, added, removed }) => {
            it(title, async () => {
                cache.getSharedByMeNodeUids = jest.fn().mockResolvedValue(existingNodeUids);
                const listener = jest.fn();
                const listeners = [{ type: SharingType.SharedByMe, callback: listener }];

                await handleSharedByMeNodes(event, cache, listeners, nodesService);
    
                if (added) {
                    expect(cache.addSharedByMeNodeUid).toHaveBeenCalledWith("nodeUid");
                    expect(listener).toHaveBeenCalledWith({ type: 'update', uid: 'nodeUid', node: { uid: 'nodeUid'} });
                } else {
                    expect(cache.addSharedByMeNodeUid).not.toHaveBeenCalled();
                }
                if (removed) {
                    expect(cache.removeSharedByMeNodeUid).toHaveBeenCalledWith("nodeUid");
                    expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid' });
                } else {
                    expect(cache.removeSharedByMeNodeUid).not.toHaveBeenCalled();
                }
                if (!added && !removed) {
                    expect(listener).not.toHaveBeenCalled();
                }
 
                expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
            });
        });
    });

    describe("without listeners", () => {
        testCases.map(({ title, existingNodeUids, event, added, removed }) => {
            it(title, async () => {
                cache.getSharedByMeNodeUids = jest.fn().mockResolvedValue(existingNodeUids);
                const listener = jest.fn();
                const listeners = [{ type: SharingType.sharedWithMe, callback: listener }];

                await handleSharedByMeNodes(event, cache, listeners, nodesService);
    
                if (added) {
                    expect(cache.addSharedByMeNodeUid).toHaveBeenCalledWith("nodeUid");
                } else {
                    expect(cache.addSharedByMeNodeUid).not.toHaveBeenCalled();
                }
                if (removed) {
                    expect(cache.removeSharedByMeNodeUid).toHaveBeenCalledWith("nodeUid");
                } else {
                    expect(cache.removeSharedByMeNodeUid).not.toHaveBeenCalled();
                }

                expect(listener).not.toHaveBeenCalled();
                expect(cache.setSharedWithMeNodeUids).not.toHaveBeenCalled();
            });
        });
    });
});

describe("handleSharedWithMeNodes", () => {
    let cache: SharingCache;
    let sharingAccess: SharingAccess;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getSharedWithMeNodeUids: jest.fn(),
            setSharedWithMeNodeUids: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharingAccess = {
            iterateSharedNodesWithMe: jest.fn(),
        };
    });

    it("should only update cache", async () => {
        const event: DriveEvent = {
            type: DriveEventType.ShareWithMeUpdated,
        };

        await handleSharedWithMeNodes(event, cache, [], sharingAccess);

        expect(cache.setSharedWithMeNodeUids).toHaveBeenCalledWith(undefined);
        expect(cache.getSharedWithMeNodeUids).not.toHaveBeenCalled();
        expect(sharingAccess.iterateSharedNodesWithMe).not.toHaveBeenCalled();
    });

    it("should update cache and notify listener", async () => {
        cache.getSharedWithMeNodeUids = jest.fn().mockResolvedValue(["nodeUid1", "nodeUid4"]);
        sharingAccess.iterateSharedNodesWithMe = jest.fn().mockImplementation(async function* () {
            yield { uid: "nodeUid1" };
            yield { uid: "nodeUid2" };
            yield { uid: "nodeUid3" };
        });
        const listener = jest.fn();
        const event: DriveEvent = {
            type: DriveEventType.ShareWithMeUpdated,
        };

        await handleSharedWithMeNodes(event, cache, [{ type: SharingType.sharedWithMe, callback: listener }], sharingAccess);

        expect(cache.setSharedWithMeNodeUids).toHaveBeenCalledWith(undefined);
        expect(cache.getSharedWithMeNodeUids).toHaveBeenCalled();
        expect(sharingAccess.iterateSharedNodesWithMe).toHaveBeenCalled();
        expect(listener).toHaveBeenCalledTimes(4);
        expect(listener).toHaveBeenCalledWith({ type: 'update', uid: 'nodeUid1', node: { uid: 'nodeUid1'} });
        expect(listener).toHaveBeenCalledWith({ type: 'update', uid: 'nodeUid2', node: { uid: 'nodeUid2'} });
        expect(listener).toHaveBeenCalledWith({ type: 'update', uid: 'nodeUid3', node: { uid: 'nodeUid3'} });
        expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid4' });
    });
});
