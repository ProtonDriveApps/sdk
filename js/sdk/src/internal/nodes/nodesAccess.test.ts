import { getMockLogger } from "../../tests/logger";
import { PrivateKey } from "../../crypto";
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache"
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { NodesAccess } from './nodesAccess';
import { SharesService, DecryptedNode, DecryptedUnparsedNode, EncryptedNode, DecryptedNodeKeys } from "./interface";

describe('nodesAccess', () => {
    let apiService: NodeAPIService;
    let cache: NodesCache;
    let cryptoCache: NodesCryptoCache;
    let cryptoService: NodesCryptoService;
    let shareService: SharesService;
    let access: NodesAccess;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            getNode: jest.fn(),
            getNodes: jest.fn(),
            iterateChildrenNodeUids: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(),
            setNode: jest.fn(),
            iterateChildren: jest.fn().mockImplementation(async function* () {}),
            isFolderChildrenLoaded: jest.fn().mockResolvedValue(false),
            setFolderChildrenLoaded: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoCache = {
            getNodeKeys: jest.fn(),
            setNodeKeys: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            decryptNode: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        shareService = {
            getSharePrivateKey: jest.fn(),
        };

        access = new NodesAccess(getMockLogger(), apiService, cache, cryptoCache, cryptoService, shareService);
    });

    describe('getNode', () => {
        it('should get node from cache', async () => {
            const node = { uid: 'nodeId', isStale: false } as DecryptedNode;
            cache.getNode = jest.fn(() => Promise.resolve(node));

            const result = await access.getNode('nodeId');
            expect(result).toBe(node);
            expect(apiService.getNode).not.toHaveBeenCalled();
        });

        it('should get node from API when cahce is stale', async () => {
            const encryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as EncryptedNode;
            const decryptedUnparsedNode = { uid: 'nodeId', parentUid: 'parentUid', name: { ok: true, value: 'name' } } as DecryptedUnparsedNode;
            const decryptedNode = {
                ...decryptedUnparsedNode,
                name: { ok: true, value: 'name' },
                isStale: false,
                activeRevision: undefined,
                folder: undefined,
            } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.resolve({ uid: 'nodeId', isStale: true } as DecryptedNode));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() => Promise.resolve({ node: decryptedUnparsedNode, keys: decryptedKeys }));

            const result = await access.getNode('nodeId');
            expect(result).toEqual(decryptedNode);
            expect(apiService.getNode).toHaveBeenCalledWith('nodeId');
            expect(cryptoCache.getNodeKeys).toHaveBeenCalledWith('parentUid');
            expect(cryptoService.decryptNode).toHaveBeenCalledWith(encryptedNode, 'parentKey');
            expect(cache.setNode).toHaveBeenCalledWith(decryptedNode);
            expect(cryptoCache.setNodeKeys).toHaveBeenCalledWith('nodeId', decryptedKeys);
        });

        it('should get node from API missing cache', async () => {
            const encryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as EncryptedNode;
            const decryptedUnparsedNode = { uid: 'nodeId', parentUid: 'parentUid', name: { ok: true, value: 'name' } } as DecryptedUnparsedNode;
            const decryptedNode = {
                ...decryptedUnparsedNode,
                name: { ok: true, value: 'name' },
                isStale: false,
                activeRevision: undefined,
                folder: undefined,
            } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.reject(new Error('Entity not found')));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() => Promise.resolve({ node: decryptedUnparsedNode, keys: decryptedKeys }));

            const result = await access.getNode('nodeId');
            expect(result).toEqual(decryptedNode);
            expect(apiService.getNode).toHaveBeenCalledWith('nodeId');
            expect(cryptoCache.getNodeKeys).toHaveBeenCalledWith('parentUid');
            expect(cryptoService.decryptNode).toHaveBeenCalledWith(encryptedNode, 'parentKey');
            expect(cache.setNode).toHaveBeenCalledWith(decryptedNode);
            expect(cryptoCache.setNodeKeys).toHaveBeenCalledWith('nodeId', decryptedKeys);
        });

        it('should validate node name', async () => {
            const encryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as EncryptedNode;
            const decryptedUnparsedNode = { uid: 'nodeId', parentUid: 'parentUid', name: { ok: true, value: 'foo/bar' } } as DecryptedUnparsedNode;
            const decryptedNode = {
                ...decryptedUnparsedNode,
                name: { ok: false, error: { name: 'foo/bar', error: "Name must not contain the character '/'" } },
            } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.reject(new Error('Entity not found')));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() => Promise.resolve({ node: decryptedUnparsedNode, keys: decryptedKeys }));

            const result = await access.getNode('nodeId');
            expect(result).toMatchObject(decryptedNode);
        });
    });

    describe('iterate methods', () => {
        beforeEach(() => {
            cryptoCache.getNodeKeys = jest.fn().mockImplementation((uid: string) => Promise.resolve({ key: 'key' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn().mockImplementation((encryptedNode: EncryptedNode) => Promise.resolve({
                node: { uid: encryptedNode.uid, isStale: false, name: { ok: true, value: 'name' } } as DecryptedNode,
                keys: { key: 'key' } as any as DecryptedNodeKeys,
            }));
        });

        describe('iterateChildren', () => {
            const parentNode = { uid: 'parentUid', isStale: false } as DecryptedNode;
            const node1 = { uid: 'node1', isStale: false } as DecryptedNode;
            const node2 = { uid: 'node2', isStale: false } as DecryptedNode;
            const node3 = { uid: 'node3', isStale: false } as DecryptedNode;
            const node4 = { uid: 'node4', isStale: false } as DecryptedNode;

            beforeEach(() => {
                cache.getNode = jest.fn().mockResolvedValue(parentNode);
            });

            it('should serve fully from cache', async () => {
                cache.isFolderChildrenLoaded = jest.fn().mockResolvedValue(true);
                cache.iterateChildren = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, node: node1 };
                    yield { ok: true, node: node2 };
                    yield { ok: true, node: node3 };
                    yield { ok: true, node: node4 };
                });

                const result = await Array.fromAsync(access.iterateChildren('parentUid'));
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateChildrenNodeUids).not.toHaveBeenCalled();
                expect(apiService.getNodes).not.toHaveBeenCalled();
            });

            it('should serve children from cache and load stale nodes only', async () => {
                cache.isFolderChildrenLoaded = jest.fn().mockResolvedValue(true);
                cache.iterateChildren = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, uid: node1.uid, node: node1 };
                    yield { ok: true, uid: node2.uid, node: { ...node2, isStale: true } };
                    yield { ok: true, uid: node3.uid, node: { ...node3, isStale: true } };
                    yield { ok: true, uid: node4.uid, node: node4 };
                });
                apiService.getNodes = jest.fn().mockImplementation((uids: string[]) => Promise.resolve(
                    uids.map((uid) => ({ uid, parentUid: parentNode.uid } as EncryptedNode))
                ));

                const result = await Array.fromAsync(access.iterateChildren('parentUid'));
                expect(result).toMatchObject([node1, node4, node2, node3]);
                expect(apiService.getNodes).toHaveBeenCalledWith(['node2', 'node3'], undefined);
                expect(cryptoService.decryptNode).toHaveBeenCalledTimes(2);
                expect(cache.setNode).toHaveBeenCalledTimes(2);
                expect(cryptoCache.setNodeKeys).toHaveBeenCalledTimes(2);
            });

            it('should load children uids and serve nodes from cache', async () => {
                apiService.iterateChildrenNodeUids = jest.fn().mockImplementation(async function* () {
                    yield 'node1';
                    yield 'node2';
                    yield 'node3';
                    yield 'node4';
                });
                cache.getNode = jest.fn().mockImplementation((uid: string) => ({ uid, isStale: false }));

                const result = await Array.fromAsync(access.iterateChildren('parentUid'));
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateChildrenNodeUids).toHaveBeenCalledWith('parentUid', undefined);
                expect(apiService.getNodes).not.toHaveBeenCalled();
                expect(cache.setFolderChildrenLoaded).toHaveBeenCalledWith('parentUid');
            });

            it('should load from API', async () => {
                apiService.iterateChildrenNodeUids = jest.fn().mockImplementation(async function* () {
                    yield 'node1';
                    yield 'node2';
                    yield 'node3';
                    yield 'node4';
                });
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    if (uid === parentNode.uid) {
                        return parentNode;
                    }
                    throw new Error('Entity not found');
                });
                apiService.getNodes = jest.fn().mockImplementation((uids: string[]) => Promise.resolve(
                    uids.map((uid) => ({ uid, parentUid: parentNode.uid } as EncryptedNode))
                ));

                const result = await Array.fromAsync(access.iterateChildren('parentUid'));
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateChildrenNodeUids).toHaveBeenCalledWith('parentUid', undefined);
                expect(apiService.getNodes).toHaveBeenCalledWith(['node1', 'node2', 'node3', 'node4'], undefined);
                expect(cryptoService.decryptNode).toHaveBeenCalledTimes(4);
                expect(cache.setNode).toHaveBeenCalledTimes(4);
                expect(cryptoCache.setNodeKeys).toHaveBeenCalledTimes(4);
                expect(cache.setFolderChildrenLoaded).toHaveBeenCalledWith('parentUid');
            });
        });

        describe('iterateTrashedNodes', () => {
            const volumeId = 'volumeId';
            const node1 = { uid: 'node1', isStale: false } as DecryptedNode;
            const node2 = { uid: 'node2', isStale: false } as DecryptedNode;
            const node3 = { uid: 'node3', isStale: false } as DecryptedNode;
            const node4 = { uid: 'node4', isStale: false } as DecryptedNode;

            beforeEach(() => {
                shareService.getMyFilesIDs = jest.fn().mockResolvedValue({ volumeId });
                apiService.iterateTrashedNodeUids = jest.fn().mockImplementation(async function* () {
                    yield node1.uid;
                    yield node2.uid;
                    yield node3.uid;
                    yield node4.uid;
                });
            });

            it('should load trashed nodes and serve nodes from cache', async () => {
                cache.getNode = jest.fn().mockImplementation((uid: string) => ({ uid, isStale: false }));

                const result = await Array.fromAsync(access.iterateTrashedNodes());
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateTrashedNodeUids).toHaveBeenCalledWith(volumeId, undefined);
                expect(apiService.getNodes).not.toHaveBeenCalled();
            });

            it('should load from API', async () => {
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    throw new Error('Entity not found');
                });
                apiService.getNodes = jest.fn().mockImplementation((uids: string[]) => Promise.resolve(
                    uids.map((uid) => ({ uid, parentUid: 'parentUid' } as EncryptedNode))
                ));

                const result = await Array.fromAsync(access.iterateTrashedNodes());
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateTrashedNodeUids).toHaveBeenCalledWith(volumeId, undefined);
                expect(apiService.getNodes).toHaveBeenCalledWith(['node1', 'node2', 'node3', 'node4'], undefined);
                expect(cryptoService.decryptNode).toHaveBeenCalledTimes(4);
                expect(cache.setNode).toHaveBeenCalledTimes(4);
                expect(cryptoCache.setNodeKeys).toHaveBeenCalledTimes(4);
            });
        });

        describe('iterateNodes', () => {
            const node1 = { uid: 'node1', isStale: false } as DecryptedNode;
            const node2 = { uid: 'node2', isStale: false } as DecryptedNode;
            const node3 = { uid: 'node3', isStale: false } as DecryptedNode;
            const node4 = { uid: 'node4', isStale: false } as DecryptedNode;

            it('should serve fully from cache', async () => {
                cache.iterateNodes = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, node: node1 };
                    yield { ok: true, node: node2 };
                    yield { ok: true, node: node3 };
                    yield { ok: true, node: node4 };
                });

                const result = await Array.fromAsync(access.iterateNodes(['node1', 'node2', 'node3', 'node4']));
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.getNodes).not.toHaveBeenCalled();
            });

            it('should load from API', async () => {
                cache.iterateNodes = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, node: node1 };
                    yield { ok: false, uid: 'node2' };
                    yield { ok: false, uid: 'node3' };
                    yield { ok: true, node: node4 };
                });
                apiService.getNodes = jest.fn().mockImplementation((uids: string[]) => Promise.resolve(
                    uids.map((uid) => ({ uid, parentUid: 'parentUid' } as EncryptedNode))
                ));

                const result = await Array.fromAsync(access.iterateNodes(['node1', 'node2', 'node3', 'node4']));
                expect(result).toMatchObject([node1, node4, node2, node3]);
                expect(apiService.getNodes).toHaveBeenCalledWith(['node2', 'node3'], undefined);
            });
        });
    });

    describe('getParentKeys', () => {
        it('should get share parent keys', async () => {
            shareService.getSharePrivateKey = jest.fn(() => Promise.resolve('shareKey' as any as PrivateKey));
            
            const result = await access.getParentKeys({ shareId: 'shareId', parentUid: undefined });
            expect(result).toEqual({ key: 'shareKey' });
            expect(cryptoCache.getNodeKeys).not.toHaveBeenCalled();
        });

        it('should get node parent keys', async () => {
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            
            const result = await access.getParentKeys({ shareId: undefined, parentUid: 'parentUid' });
            expect(result).toEqual({ key: 'parentKey' });
            expect(shareService.getSharePrivateKey).not.toHaveBeenCalled();
        });

        it('should get node parent keys even if share is set', async () => {
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            
            const result = await access.getParentKeys({ shareId: 'shareId', parentUid: 'parentUid' });
            expect(result).toEqual({ key: 'parentKey' });
            expect(shareService.getSharePrivateKey).not.toHaveBeenCalled();
        });
    });

    describe('getNodeKeys', () => {
        it('should load node if not cached', async () => {
            cryptoCache.getNodeKeys = jest.fn(() => Promise.reject(new Error('Entity not found')));
            apiService.getNode = jest.fn(() => Promise.reject(new Error('API called')));

            try {
                await access.getNodeKeys('nodeId');
                throw new Error('Expected error');
            } catch (error: unknown) {
                expect(`${error}`).toBe('Error: API called');
            }
        });
    });
});
