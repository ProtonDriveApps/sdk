import { DriveEvent, DriveEventType } from "../events";
import { updateCacheByEvent, notifyListenersByEvent } from "./events";
import { DecryptedNode } from "./interface";
import { NodesCache } from "./cache";
import { NodesAccess } from "./nodesAccess";

describe("updateCacheByEvent", () => {
    let cache: NodesCache;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(),
            setNode: jest.fn(),
            removeNodes: jest.fn(),
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
            await updateCacheByEvent(event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(0);
            expect(cache.setNode).toHaveBeenCalledTimes(0);
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
            cache.getNode = jest.fn(() => Promise.resolve({ uid: '123' } as DecryptedNode));

            await updateCacheByEvent(event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(1);
            expect(cache.setNode).toHaveBeenCalledTimes(1);
            expect(cache.setNode).toHaveBeenCalledWith({ uid: '123', isStale: true });
        });

        it("should skip if missing in cache", async () => {
            cache.getNode = jest.fn(() => Promise.reject(new Error('Missing in the cache')));

            await updateCacheByEvent(event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(1);
            expect(cache.setNode).toHaveBeenCalledTimes(0);
        });

        it("should remove from cache if not possible to set", async () => {
            cache.getNode = jest.fn(() => Promise.resolve({ uid: '123' } as DecryptedNode));
            cache.setNode = jest.fn(() => Promise.reject(new Error('Cannot set node')));

            await updateCacheByEvent(event, cache);

            expect(cache.getNode).toHaveBeenCalledTimes(1);
            expect(cache.removeNodes).toHaveBeenCalledTimes(1);
        });

        it("should throw if remove fails", async () => {
            cache.getNode = jest.fn(() => Promise.resolve({ uid: '123' } as DecryptedNode));
            cache.setNode = jest.fn(() => Promise.reject(new Error('Cannot set node')));
            cache.removeNodes = jest.fn(() => Promise.reject(new Error('Cannot remove node')));

            await expect(updateCacheByEvent(event, cache)).rejects.toThrow('Cannot set node');
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
            await updateCacheByEvent(event, cache);

            expect(cache.removeNodes).toHaveBeenCalledTimes(1);
            expect(cache.removeNodes).toHaveBeenCalledWith([event.nodeUid]);
        });
    });
});

describe("notifyListenersByEvent", () => {
    let cache: NodesCache;
    let nodesAccess: NodesAccess;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesAccess = {
            getNode: jest.fn(() => Promise.resolve({ uid: 'nodeUid' } as DecryptedNode)),
        };
    });

    describe('update event', () => {
        it("should notify listeners by parentNodeUid", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: false,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'parentUid', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ type: 'update', uid: 'nodeUid', node: { uid: 'nodeUid'} });
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(1);
        });

        it("should notify listeners by isTrashed", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: true,
                isShared: false,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(event, [{ condition: ({ isTrashed }) => !!isTrashed, callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ type: 'update', uid: 'nodeUid', node: { uid: 'nodeUid'} });
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(1);
        });

        it("should notify listeners by isShared", async () => {
            const event: DriveEvent = {
                type: DriveEventType.NodeUpdated,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isTrashed: false,
                isShared: true,
                isOwnVolume: true,
            };
            const listener = jest.fn();
    
            await notifyListenersByEvent(event, [{ condition: ({ isShared }) => !!isShared, callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ type: 'update', uid: 'nodeUid', node: { uid: 'nodeUid'} });
            expect(nodesAccess.getNode).toHaveBeenCalledTimes(1);
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
    
            await notifyListenersByEvent(event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'lalalala', callback: listener }], cache, nodesAccess);
    
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
    
            await notifyListenersByEvent(event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'parentUid', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid' });
        });

        it("should notify listeners by isTrashed from cache", async () => {
            cache.getNode = jest.fn(() => Promise.resolve({ uid: 'nodeUid', trashedDate: new Date() } as DecryptedNode));
            const event: DriveEvent = {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            };
    
            const listener = jest.fn();
    
            await notifyListenersByEvent(event, [{ condition: ({ isTrashed }) => !!isTrashed, callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ type: 'remove', uid: 'nodeUid' });
        });

        it("should notify listeners by isShared from cache", async () => {
            cache.getNode = jest.fn(() => Promise.resolve({ uid: 'nodeUid', isShared: true } as DecryptedNode));
            const event: DriveEvent = {
                type: DriveEventType.NodeDeleted,
                nodeUid: "nodeUid",
                parentNodeUid: "parentUid",
                isOwnVolume: true,
            };
    
            const listener = jest.fn();
    
            await notifyListenersByEvent(event, [{ condition: ({ isShared }) => !!isShared, callback: listener }], cache, nodesAccess);
    
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
    
            await notifyListenersByEvent(event, [{ condition: ({ isTrashed }) => !!isTrashed, callback: listener }], cache, nodesAccess);
    
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
    
            await notifyListenersByEvent(event, [{ condition: ({ parentNodeUid }) => parentNodeUid === 'lalalala', callback: listener }], cache, nodesAccess);
    
            expect(listener).toHaveBeenCalledTimes(0);
        });
    });

});
