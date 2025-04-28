import { getMockLogger } from "../../tests/logger";
import { DriveEventsService, DriveEvent, DriveEventType } from "../events";
import { NodesEvents, updateCacheByEvent, deleteFromCacheByEvent, notifyListenersByEvent } from "./events";
import { DecryptedNode } from "./interface";
import { NodesCache } from "./cache";
import { NodesAccess } from "./nodesAccess";

describe("updateCacheByEvent", () => {
    const logger = getMockLogger();

    let cache: NodesCache;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(() => Promise.resolve({
                uid: '123',
                parentUid: 'parentUid',
                name: { ok: true, value: 'name' },
            } as DecryptedNode)),
            setNode: jest.fn(),
            removeNodes: jest.fn(),
            resetFolderChildrenLoaded: jest.fn(),
        };
    });

    describe('NodeCreated event', () => {
        const event: DriveEvent = {
            type: DriveEventType.NodeCreated,
            nodeUid: "nodeUid",
            parentNodeUid: "parentUid",
            isTrashed: false,
            isShared: false,
            isOwnVolume: true,
        };

        it("should not update cache by node create event", async () => {
            await updateCacheByEvent(logger, event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(0);
            expect(cache.setNode).toHaveBeenCalledTimes(0);
        });

        it("should reset parent loaded state", async () => {
            await updateCacheByEvent(logger, event, cache);

            expect(cache.resetFolderChildrenLoaded).toHaveBeenCalledWith('parentUid');
        });
    });

    describe('NodeUpdated event', () => {
        const event: DriveEvent = {
            type: DriveEventType.NodeUpdated,
            nodeUid: "nodeUid",
            parentNodeUid: "parentUid",
            isTrashed: false,
            isShared: false,
            isOwnVolume: true,
        };

        it("should update cache if present in cache", async () => {
            await updateCacheByEvent(logger, event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(1);
            expect(cache.setNode).toHaveBeenCalledTimes(1);
            expect(cache.setNode).toHaveBeenCalledWith(expect.objectContaining({ uid: '123', isStale: true, parentUid: "parentUid" }));
        });

        it("should skip if missing in cache", async () => {
            cache.getNode = jest.fn(() => Promise.reject(new Error('Missing in the cache')));

            await updateCacheByEvent(logger, event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(1);
            expect(cache.setNode).toHaveBeenCalledTimes(0);
        });

        it("should remove from cache if not possible to set", async () => {
            cache.setNode = jest.fn(() => Promise.reject(new Error('Cannot set node')));

            await updateCacheByEvent(logger, event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(1);
            expect(cache.removeNodes).toHaveBeenCalledTimes(1);
        });

        it("should throw if remove fails", async () => {
            cache.setNode = jest.fn(() => Promise.reject(new Error('Cannot set node')));
            cache.removeNodes = jest.fn(() => Promise.reject(new Error('Cannot remove node')));

            await expect(updateCacheByEvent(logger, event, cache)).rejects.toThrow('Cannot set node');
        });
    });

    describe('NodeDeleted event', () => {
        const event: DriveEvent = {
            type: DriveEventType.NodeDeleted,
            nodeUid: "nodeUid",
            parentNodeUid: "parentUid",
            isOwnVolume: true,
        }

        it("should remove node from cache", async () => {
            await deleteFromCacheByEvent(logger, event, cache);

            expect(cache.removeNodes).toHaveBeenCalledTimes(1);
            expect(cache.removeNodes).toHaveBeenCalledWith([event.nodeUid]);
        });
    });
});

describe("notifyListenersByEvent", () => {
    const logger = getMockLogger();

    let cache: NodesCache;
    let nodesAccess: NodesAccess;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(() => Promise.resolve({
                uid: '123',
                parentUid: 'parentUid',
                name: { ok: true, value: 'name' },
            } as DecryptedNode)),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesAccess = {
            getNode: jest.fn(() => Promise.resolve({ uid: 'nodeUid', name: { ok: true, value: 'name' } } as DecryptedNode)),
        };
    });

    describe('update event', () => {
        it("should notify listeners by parentNodeUid when there is update", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'parentUid', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'update', uid: 'nodeUid' }));
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(1);
            expect(cache.getNode).toHaveBeenCalledTimes(0);
        });

        it("should notify listeners by parentNodeUid when it is moved to another parent", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "newParentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'parentUid', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'remove', uid: 'nodeUid' }));
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(0);
            expect(cache.getNode).toHaveBeenCalledTimes(1);
        });

        it("should notify listeners by isTrashed when there is update", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: true,
                isShared: false,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ isTrashed }) => !!isTrashed, callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'update', uid: 'nodeUid' }));
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(1);
            expect(cache.getNode).toHaveBeenCalledTimes(0);
        });

        it("should notify listeners by isTrashed when it is moved out of trash", async () => {
            cache.getNode = jest.fn(() => Promise.resolve({
                uid: '123',
                parentUid: 'parentUid',
                name: { ok: true, value: 'name' },
                trashTime: new Date(),
            } as DecryptedNode));
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ isTrashed }) => !!isTrashed, callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'remove', uid: 'nodeUid' }));
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(0);
            expect(cache.getNode).toHaveBeenCalledTimes(1);
        });

        it("should not notify listeners if neither condition match", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'lalalala', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(0);
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(0);
        });
    });

    describe('delete event', () => {
        it("should notify listeners by parentNodeUid", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'parentUid', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid' });
        });

        it("should notify listeners by isTrashed from cache", async () => {
            cache.getNode = jest.fn(() => Promise.resolve({ uid: 'nodeUid', trashTime: new Date() } as DecryptedNode));
            const event: DriveEvent = {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            };
    
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ isTrashed }) => !!isTrashed, callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid' });
        });

        it("should not notify listeners if cache is missing node", async () => {
            cache.getNode = jest.fn(() => Promise.reject(new Error('Missing in the cache')));
            const event: DriveEvent = {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ isTrashed }) => !!isTrashed, callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(0);
        });

        it("should not notify listeners if neither condition match", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(logger, event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'lalalala', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(0);
        });
    });
});

describe("NodesEvents integration", () => {
    const logger = getMockLogger();

    let eventsService: DriveEventsService;
    let eventsServiceCallback;
    let cache: NodesCache;
    let nodesAccess: NodesAccess;
    let listener: jest.Mock;
    let events: NodesEvents;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        eventsService = {
            addListener: jest.fn((callback) => {
                eventsServiceCallback = callback;
            }),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(() => Promise.resolve({
                uid: 'nodeUid',
                parentUid: 'parentUid',
                name: { ok: true, value: 'name' },
                trashTime: new Date(),
            } as DecryptedNode)),
            setNode: jest.fn(),
            removeNodes: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesAccess = {
            getNode: jest.fn(() => Promise.resolve({
                uid: 'nodeUid',
                parentUid: 'parentUid',
                name: { ok: true, value: 'name' },
            } as DecryptedNode)),
        };
        listener = jest.fn();
        events = new NodesEvents(logger, eventsService, cache, nodesAccess);
        events.subscribeToTrashedNodes(listener);
    });

    it("should send remove to trash listener when node is restored from trash", async () => {
        await eventsServiceCallback!([{
            type: DriveEventType.NodeUpdated,
            nodeUid: "nodeUid",
            parentNodeUid: "parentUid",
            isTrashed: false,
            isShared: false,
            isOwnVolume: true,
        } as DriveEvent]);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid' });
        expect(cache.setNode).toHaveBeenCalledTimes(1);
        expect(cache.setNode).toHaveBeenCalledWith(expect.objectContaining({ uid: 'nodeUid', isStale: true }));
    });

    it("should send remove to trash listener when node is deleted", async () => {
        await eventsServiceCallback!([{
            type: DriveEventType.NodeDeleted,
            nodeUid: "nodeUid",
            parentNodeUid: "parentUid",
            isTrashed: false,
            isShared: false,
            isOwnVolume: true,
        } as DriveEvent]);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid' });
        expect(cache.setNode).toHaveBeenCalledTimes(0);
        expect(cache.removeNodes).toHaveBeenCalledTimes(1);
        expect(cache.removeNodes).toHaveBeenCalledWith(['nodeUid']);
    });
});
