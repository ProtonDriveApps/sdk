import { getMockLogger } from "../../tests/logger";
import { DriveEvent, DriveEventType } from "../events";
import { NodesEventsHandler } from "./events";
import { DecryptedNode } from "./interface";
import { NodesCache } from "./cache";

describe("NodesEventsHandler", () => {
    const logger = getMockLogger();
    let cache: NodesCache;
    let nodesEventsNodesEventsHandler: NodesEventsHandler;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(() => Promise.resolve({
                uid: "nodeUid123",
                parentUid: "parentUid",
                name: { ok: true, value: "name" },
            } as DecryptedNode)),
            setNode: jest.fn(),
            removeNodes: jest.fn(),
            resetFolderChildrenLoaded: jest.fn(),
        };
        nodesEventsNodesEventsHandler = new NodesEventsHandler(logger, cache);
    });

    it("should unset the parent listing complete status when a `NodeCreated` event is received.", async () => {
        const event: DriveEvent = {
            eventId: "event1",
            type: DriveEventType.NodeCreated,
            nodeUid: "nodeUid",
            parentNodeUid: "parentUid",
            isTrashed: false,
            isShared: false,
            treeEventScopeId: "volume1",
        };
        await nodesEventsNodesEventsHandler.updateNodesCacheOnEvent(event);

        expect(cache.resetFolderChildrenLoaded).toHaveBeenCalledTimes(1);
        expect(cache.resetFolderChildrenLoaded).toHaveBeenCalledWith("parentUid");
        expect(cache.setNode).toHaveBeenCalledTimes(0);
    });

    it("should update the node metadata when a `NodeUpdated` event is received.", async () => {
        const event: DriveEvent = {
            type: DriveEventType.NodeUpdated,
            eventId: "event1",
            nodeUid: "nodeUid123",
            parentNodeUid: "parentUid",
            isTrashed: false,
            isShared: false,
            treeEventScopeId: "volume1",
        };
        await nodesEventsNodesEventsHandler.updateNodesCacheOnEvent(event);

        expect(cache.getNode).toHaveBeenCalledTimes(1);
        expect(cache.setNode).toHaveBeenCalledTimes(1);
        expect(cache.setNode).toHaveBeenCalledWith(expect.objectContaining({ uid: 'nodeUid123', isStale: true, parentUid: "parentUid", trashTime: undefined, isShared: false }));
    });

    it("should remove node from cache", async () => {
        const event: DriveEvent = {
            type: DriveEventType.NodeDeleted,
            eventId: "event1",
            nodeUid: "nodeUid123",
            parentNodeUid: "parentUid",
            treeEventScopeId: "volume1",
        };

        await nodesEventsNodesEventsHandler.updateNodesCacheOnEvent(event);

        expect(cache.removeNodes).toHaveBeenCalledTimes(1);
        expect(cache.removeNodes).toHaveBeenCalledWith([event.nodeUid]);
    });
});
