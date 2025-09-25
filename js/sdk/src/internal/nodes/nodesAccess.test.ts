import { getMockLogger } from '../../tests/logger';
import { PrivateKey } from '../../crypto';
import { DecryptionError } from '../../errors';
import { NodeAPIService } from './apiService';
import { NodesCache } from './cache';
import { NodesCryptoCache } from './cryptoCache';
import { NodesCryptoService } from './cryptoService';
import { NodesAccess } from './nodesAccess';
import { SharesService, DecryptedNode, DecryptedUnparsedNode, EncryptedNode, DecryptedNodeKeys } from './interface';
import { NodeType } from '../../interface';

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
            iterateNodes: jest.fn().mockImplementation(async function* (uids: string[]) {
                yield* uids.map((uid) => ({ uid, parentUid: 'volumeId~parentNodeId' }) as EncryptedNode);
            }),
            iterateChildrenNodeUids: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(),
            setNode: jest.fn(),
            iterateChildren: jest.fn().mockImplementation(async function* () {}),
            isFolderChildrenLoaded: jest.fn().mockResolvedValue(false),
            setFolderChildrenLoaded: jest.fn(),
            removeNodes: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cryptoCache = {
            getNodeKeys: jest.fn(),
            setNodeKeys: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            decryptNode: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        shareService = {
            getOwnVolumeIDs: jest.fn().mockResolvedValue({ volumeId: 'volumeId' }),
            getSharePrivateKey: jest.fn(),
        };

        access = new NodesAccess(getMockLogger(), apiService, cache, cryptoCache, cryptoService, shareService);
    });

    describe('getNode', () => {
        it('should get node from cache', async () => {
            const node = { uid: 'volumeId~nodeId', isStale: false } as DecryptedNode;
            cache.getNode = jest.fn(() => Promise.resolve(node));

            const result = await access.getNode('volumeId~nodeId');
            expect(result).toBe(node);
            expect(apiService.getNode).not.toHaveBeenCalled();
        });

        it('should get node from API when cache is stale', async () => {
            const encryptedNode = { uid: 'volumeId~nodeId', parentUid: 'volumeId~parentNodeid' } as EncryptedNode;
            const decryptedUnparsedNode = {
                uid: 'volumeId~nodeId',
                parentUid: 'volumeId~parentNodeid',
                name: { ok: true, value: 'name' },
            } as DecryptedUnparsedNode;
            const decryptedNode = {
                ...decryptedUnparsedNode,
                name: { ok: true, value: 'name' },
                isStale: false,
                activeRevision: undefined,
                folder: undefined,
                treeEventScopeId: 'volumeId',
            } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.resolve({ uid: 'volumeId~nodeId', isStale: true } as DecryptedNode));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() =>
                Promise.resolve({ node: decryptedUnparsedNode, keys: decryptedKeys }),
            );

            const result = await access.getNode('volumeId~nodeId');
            expect(result).toEqual(decryptedNode);
            expect(apiService.getNode).toHaveBeenCalledWith('volumeId~nodeId', 'volumeId');
            expect(cryptoCache.getNodeKeys).toHaveBeenCalledWith('volumeId~parentNodeid');
            expect(cryptoService.decryptNode).toHaveBeenCalledWith(encryptedNode, 'parentKey');
            expect(cache.setNode).toHaveBeenCalledWith(decryptedNode);
            expect(cryptoCache.setNodeKeys).toHaveBeenCalledWith('volumeId~nodeId', decryptedKeys);
        });

        it('should get node from API missing cache', async () => {
            const encryptedNode = { uid: 'volumeId~nodeId', parentUid: 'volumeId~parentNodeid' } as EncryptedNode;
            const decryptedUnparsedNode = {
                uid: 'volumeId~nodeId',
                parentUid: 'volumeId~parentNodeid',
                name: { ok: true, value: 'name' },
            } as DecryptedUnparsedNode;
            const decryptedNode = {
                ...decryptedUnparsedNode,
                name: { ok: true, value: 'name' },
                isStale: false,
                activeRevision: undefined,
                folder: undefined,
                treeEventScopeId: 'volumeId',
            } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.reject(new Error('Entity not found')));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() =>
                Promise.resolve({ node: decryptedUnparsedNode, keys: decryptedKeys }),
            );

            const result = await access.getNode('volumeId~nodeId');
            expect(result).toEqual(decryptedNode);
            expect(apiService.getNode).toHaveBeenCalledWith('volumeId~nodeId', 'volumeId');
            expect(cryptoCache.getNodeKeys).toHaveBeenCalledWith('volumeId~parentNodeid');
            expect(cryptoService.decryptNode).toHaveBeenCalledWith(encryptedNode, 'parentKey');
            expect(cache.setNode).toHaveBeenCalledWith(decryptedNode);
            expect(cryptoCache.setNodeKeys).toHaveBeenCalledWith('volumeId~nodeId', decryptedKeys);
        });

        it('should validate node name', async () => {
            const encryptedNode = { uid: 'volumeId~nodeId', parentUid: 'volumeId~parentNodeid' } as EncryptedNode;
            const decryptedUnparsedNode = {
                uid: 'volumeId~nodeId',
                parentUid: 'volumeId~parentNodeid',
                name: { ok: true, value: 'foo/bar' },
            } as DecryptedUnparsedNode;
            const decryptedNode = {
                ...decryptedUnparsedNode,
                name: { ok: false, error: { name: 'foo/bar', error: "Name must not contain the character '/'" } },
                treeEventScopeId: 'volumeId',
            } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.reject(new Error('Entity not found')));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() =>
                Promise.resolve({ node: decryptedUnparsedNode, keys: decryptedKeys }),
            );

            const result = await access.getNode('volumeId~nodeId');
            expect(result).toMatchObject(decryptedNode);
        });
    });

    describe('iterate methods', () => {
        beforeEach(() => {
            cryptoCache.getNodeKeys = jest
                .fn()
                .mockImplementation((uid: string) => Promise.resolve({ key: 'key' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn().mockImplementation((encryptedNode: EncryptedNode) =>
                Promise.resolve({
                    node: {
                        uid: encryptedNode.uid,
                        isStale: false,
                        name: { ok: true, value: 'name' },
                    } as DecryptedNode,
                    keys: { key: 'key' } as any as DecryptedNodeKeys,
                }),
            );
        });

        describe('iterateChildren', () => {
            const parentNode = { uid: 'volumeId~parentNodeid', isStale: false } as DecryptedNode;
            const node1 = { uid: 'volumeId~node1', isStale: false } as DecryptedNode;
            const node2 = { uid: 'volumeId~node2', isStale: false } as DecryptedNode;
            const node3 = { uid: 'volumeId~node3', isStale: false } as DecryptedNode;
            const node4 = { uid: 'volumeId~node4', isStale: false } as DecryptedNode;

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

                const result = await Array.fromAsync(access.iterateFolderChildren('volumeId~parentNodeid'));
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateChildrenNodeUids).not.toHaveBeenCalled();
                expect(apiService.iterateNodes).not.toHaveBeenCalled();
            });

            it('should serve children from cache and load stale nodes only', async () => {
                cache.isFolderChildrenLoaded = jest.fn().mockResolvedValue(true);
                cache.iterateChildren = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, uid: node1.uid, node: node1 };
                    yield { ok: true, uid: node2.uid, node: { ...node2, isStale: true } };
                    yield { ok: true, uid: node3.uid, node: { ...node3, isStale: true } };
                    yield { ok: true, uid: node4.uid, node: node4 };
                });

                const result = await Array.fromAsync(access.iterateFolderChildren('volumeId~parentNodeid'));
                expect(result).toMatchObject([node1, node4, node2, node3]);
                expect(apiService.iterateNodes).toHaveBeenCalledWith(
                    [node2.uid, node3.uid],
                    'volumeId',
                    undefined, // filterOptions
                    undefined, // signal
                );
                expect(cryptoService.decryptNode).toHaveBeenCalledTimes(2);
                expect(cache.setNode).toHaveBeenCalledTimes(2);
                expect(cryptoCache.setNodeKeys).toHaveBeenCalledTimes(2);
            });

            it('should load children uids and serve nodes from cache', async () => {
                apiService.iterateChildrenNodeUids = jest.fn().mockImplementation(async function* () {
                    yield node1.uid;
                    yield node2.uid;
                    yield node3.uid;
                    yield node4.uid;
                });
                cache.getNode = jest.fn().mockImplementation((uid: string) => ({ uid, isStale: false }));

                const result = await Array.fromAsync(access.iterateFolderChildren('volumeId~parentNodeid'));
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateChildrenNodeUids).toHaveBeenCalledWith(
                    'volumeId~parentNodeid',
                    false, // onlyFolders
                    undefined, // signal
                );
                expect(apiService.iterateNodes).not.toHaveBeenCalled();
                expect(cache.setFolderChildrenLoaded).toHaveBeenCalledWith('volumeId~parentNodeid');
            });

            it('should load from API', async () => {
                apiService.iterateChildrenNodeUids = jest.fn().mockImplementation(async function* () {
                    yield node1.uid;
                    yield node2.uid;
                    yield node3.uid;
                    yield node4.uid;
                });
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    if (uid === parentNode.uid) {
                        return parentNode;
                    }
                    throw new Error('Entity not found');
                });

                const result = await Array.fromAsync(access.iterateFolderChildren('volumeId~parentNodeid'));
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateChildrenNodeUids).toHaveBeenCalledWith(
                    'volumeId~parentNodeid',
                    false, // onlyFolders
                    undefined, // signal
                );
                expect(apiService.iterateNodes).toHaveBeenCalledWith(
                    ['volumeId~node1', 'volumeId~node2', 'volumeId~node3', 'volumeId~node4'],
                    'volumeId',
                    undefined, // filterOptions
                    undefined, // signal
                );
                expect(cryptoService.decryptNode).toHaveBeenCalledTimes(4);
                expect(cache.setNode).toHaveBeenCalledTimes(4);
                expect(cryptoCache.setNodeKeys).toHaveBeenCalledTimes(4);
                expect(cache.setFolderChildrenLoaded).toHaveBeenCalledWith('volumeId~parentNodeid');
            });

            it('should remove from cache if missing on API', async () => {
                apiService.iterateChildrenNodeUids = jest.fn().mockImplementation(async function* () {
                    yield node1.uid;
                    yield node2.uid;
                    yield node3.uid;
                });
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    if (uid === parentNode.uid) {
                        return parentNode;
                    }
                    throw new Error('Entity not found');
                });
                apiService.iterateNodes = jest.fn().mockImplementation(async function* (uids: string[]) {
                    // Skip first node - make it missing.
                    yield* uids.slice(1).map((uid) => ({ uid, parentUid: parentNode.uid }) as EncryptedNode);
                });

                const result = await Array.fromAsync(access.iterateFolderChildren('volumeId~parentNodeid'));
                expect(result).toMatchObject([node2, node3]);
                expect(cache.removeNodes).toHaveBeenCalledWith([node1.uid]);
            });

            it('should yield all decryptable children before throwing error', async () => {
                apiService.iterateChildrenNodeUids = jest.fn().mockImplementation(async function* () {
                    yield 'volumeId~node1';
                    yield 'volumeId~node2';
                    yield 'volumeId~node3';
                });
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    if (uid === parentNode.uid) {
                        return parentNode;
                    }
                    throw new Error('Entity not found');
                });
                cryptoService.decryptNode = jest.fn().mockImplementation((encryptedNode: EncryptedNode) => {
                    if (encryptedNode.uid === 'volumeId~node2') {
                        throw new DecryptionError('Decryption failed');
                    }
                    return Promise.resolve({
                        node: {
                            uid: encryptedNode.uid,
                            isStale: false,
                            name: { ok: true, value: 'name' },
                        } as DecryptedNode,
                        keys: { key: 'key' } as any as DecryptedNodeKeys,
                    });
                });

                const generator = access.iterateFolderChildren('volumeId~parentNodeid');
                const node1 = await generator.next();
                expect(node1.value).toMatchObject({ uid: 'volumeId~node1' });
                const node2 = await generator.next();
                expect(node2.value).toMatchObject({ uid: 'volumeId~node3' });
                const node3 = generator.next();
                await expect(node3).rejects.toThrow('Failed to decrypt some nodes');
                try {
                    await node3;
                } catch (error: any) {
                    expect(error.cause).toEqual([new DecryptionError('Decryption failed')]);
                }
            });

            it('should return only filtered nodes from cache', async () => {
                cache.isFolderChildrenLoaded = jest.fn().mockResolvedValue(true);
                cache.iterateChildren = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, node: { ...node1, type: NodeType.Folder } };
                    yield { ok: true, node: { ...node2, type: NodeType.Folder } };
                    yield { ok: true, node: { ...node3, type: NodeType.File } };
                    yield { ok: true, node: { ...node4, type: NodeType.File } };
                });

                const result = await Array.fromAsync(
                    access.iterateFolderChildren('volumeId~parentNodeid', { type: NodeType.Folder }),
                );

                expect(result).toMatchObject([node1, node2]);
                expect(cache.setFolderChildrenLoaded).not.toHaveBeenCalled();
            });

            it('should return only filtered nodes from API', async () => {
                cache.isFolderChildrenLoaded = jest.fn().mockResolvedValue(false);
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    if (uid === parentNode.uid) {
                        return parentNode;
                    }
                    throw new Error('Entity not found');
                });
                apiService.iterateChildrenNodeUids = jest.fn().mockImplementation(async function* () {
                    yield 'volumeId~node1';
                    yield 'volumeId~node2';
                    yield 'volumeId~node3';
                    yield 'volumeId~node4';
                });
                apiService.iterateNodes = jest.fn().mockImplementation(async function* () {
                    yield { ...node1, parentUid: 'volumeId~parentNodeId', type: NodeType.Folder };
                    yield { ...node2, parentUid: 'volumeId~parentNodeId', type: NodeType.Folder };
                });

                const result = await Array.fromAsync(
                    access.iterateFolderChildren('volumeId~parentNodeid', { type: NodeType.Folder }),
                );

                expect(result).toMatchObject([node1, node2]);
                expect(cache.setFolderChildrenLoaded).not.toHaveBeenCalled();
            });
        });

        describe('iterateTrashedNodes', () => {
            const volumeId = 'volumeId';
            const node1 = { uid: 'volumeId~node1', isStale: false } as DecryptedNode;
            const node2 = { uid: 'volumeId~node2', isStale: false } as DecryptedNode;
            const node3 = { uid: 'volumeId~node3', isStale: false } as DecryptedNode;
            const node4 = { uid: 'volumeId~node4', isStale: false } as DecryptedNode;

            beforeEach(() => {
                shareService.getOwnVolumeIDs = jest.fn().mockResolvedValue({ volumeId });
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
                expect(apiService.iterateNodes).not.toHaveBeenCalled();
            });

            it('should load from API', async () => {
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    throw new Error('Entity not found');
                });

                const result = await Array.fromAsync(access.iterateTrashedNodes());
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateTrashedNodeUids).toHaveBeenCalledWith(volumeId, undefined);
                expect(apiService.iterateNodes).toHaveBeenCalledWith(
                    ['volumeId~node1', 'volumeId~node2', 'volumeId~node3', 'volumeId~node4'],
                    volumeId,
                    undefined, // filterOptions
                    undefined, // signal
                );
                expect(cryptoService.decryptNode).toHaveBeenCalledTimes(4);
                expect(cache.setNode).toHaveBeenCalledTimes(4);
                expect(cryptoCache.setNodeKeys).toHaveBeenCalledTimes(4);
            });

            it('should remove from cache if missing on API', async () => {
                cache.getNode = jest.fn().mockImplementation((uid: string) => {
                    throw new Error('Entity not found');
                });
                apiService.iterateNodes = jest.fn().mockImplementation(async function* (uids: string[]) {
                    // Skip first node - make it missing.
                    yield* uids.slice(1).map((uid) => ({ uid, parentUid: 'volumeId~parentNodeid' }) as EncryptedNode);
                });

                const result = await Array.fromAsync(access.iterateTrashedNodes());
                expect(result).toMatchObject([node2, node3, node4]);
                expect(cache.removeNodes).toHaveBeenCalledWith(['volumeId~node1']);
            });
        });

        describe('iterateNodes', () => {
            const node1 = { uid: 'volumeId~node1', isStale: false, treeEventScopeId: 'volumeId' } as DecryptedNode;
            const node2 = { uid: 'volumeId~node2', isStale: false, treeEventScopeId: 'volumeId' } as DecryptedNode;
            const node3 = { uid: 'volumeId~node3', isStale: false, treeEventScopeId: 'volumeId' } as DecryptedNode;
            const node4 = { uid: 'volumeId~node4', isStale: false, treeEventScopeId: 'volumeId' } as DecryptedNode;

            it('should serve fully from cache', async () => {
                cache.iterateNodes = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, node: node1 };
                    yield { ok: true, node: node2 };
                    yield { ok: true, node: node3 };
                    yield { ok: true, node: node4 };
                });

                const result = await Array.fromAsync(
                    access.iterateNodes(['volumeId~node1', 'volumeId~node2', 'volumeId~node3', 'volumeId~node4']),
                );
                expect(result).toMatchObject([node1, node2, node3, node4]);
                expect(apiService.iterateNodes).not.toHaveBeenCalled();
            });

            it('should load from API', async () => {
                cache.iterateNodes = jest.fn().mockImplementation(async function* () {
                    yield { ok: true, node: node1 };
                    yield { ok: false, uid: 'volumeId~node2' };
                    yield { ok: false, uid: 'volumeId~node3' };
                    yield { ok: true, node: node4 };
                });

                const result = await Array.fromAsync(
                    access.iterateNodes(['volumeId~node1', 'volumeId~node2', 'volumeId~node3', 'volumeId~node4']),
                );
                expect(result).toMatchObject([node1, node4, node2, node3]);
                expect(apiService.iterateNodes).toHaveBeenCalledWith(
                    ['volumeId~node2', 'volumeId~node3'],
                    'volumeId',
                    undefined, // filterOptions
                    undefined, // signal
                );
            });

            it('should remove from cache if missing on API and return back to caller', async () => {
                cache.iterateNodes = jest.fn().mockImplementation(async function* () {
                    yield { ok: false, uid: 'volumeId~node1' };
                    yield { ok: false, uid: 'volumeId~node2' };
                    yield { ok: false, uid: 'volumeId~node3' };
                });
                apiService.iterateNodes = jest.fn().mockImplementation(async function* (uids: string[]) {
                    // Skip first node - make it missing.
                    yield* uids.slice(1).map((uid) => ({ uid, parentUid: 'volumeId~parentNodeid' }) as EncryptedNode);
                });

                const result = await Array.fromAsync(
                    access.iterateNodes(['volumeId~node1', 'volumeId~node2', 'volumeId~node3']),
                );
                expect(result).toMatchObject([node2, node3, { missingUid: 'volumeId~node1' }]);
                expect(cache.removeNodes).toHaveBeenCalledWith(['volumeId~node1']);
            });

            it('should return degraded node if parent cannot be decrypted', async () => {
                cache.iterateNodes = jest.fn().mockImplementation(async function* () {
                    yield { ok: false, uid: 'volumeId~node1' };
                    yield { ok: false, uid: 'volumeId~node2' };
                    yield { ok: false, uid: 'volumeId~node3' };
                });
                const encryptedCrypto = {
                    signatureEmail: 'signatureEmail',
                    nameSignatureEmail: 'nameSignatureEmail',
                };
                apiService.iterateNodes = jest.fn().mockImplementation(async function* (uids: string[]) {
                    yield* uids.map((uid) => {
                        const parentUid = uid.replace('node', 'parentOfNode');
                        return {
                            uid,
                            parentUid,
                            encryptedCrypto,
                        } as EncryptedNode;
                    });
                });
                const decryptionError = new DecryptionError('Parent cannot be decrypted');
                jest.spyOn(access, 'getParentKeys').mockImplementation(async ({ parentUid }) => {
                    if (parentUid === 'volumeId~parentOfNode1') {
                        throw decryptionError;
                    }
                    return {
                        key: { _idx: 32132 },
                    } as any;
                });

                const result = await Array.fromAsync(
                    access.iterateNodes(['volumeId~node1', 'volumeId~node2', 'volumeId~node3']),
                );
                expect(result).toEqual([
                    {
                        ...node1,
                        encryptedCrypto,
                        parentUid: 'volumeId~parentOfNode1',
                        name: { ok: false, error: decryptionError },
                        keyAuthor: {
                            ok: false,
                            error: { claimedAuthor: 'signatureEmail', error: decryptionError.message },
                        },
                        nameAuthor: {
                            ok: false,
                            error: { claimedAuthor: 'nameSignatureEmail', error: decryptionError.message },
                        },
                        errors: [decryptionError],
                    },
                    {
                        ...node2,
                        name: { ok: true, value: 'name' },
                        folder: undefined,
                        activeRevision: undefined,
                    },
                    {
                        ...node3,
                        name: { ok: true, value: 'name' },
                        folder: undefined,
                        activeRevision: undefined,
                    },
                ]);
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

            const result = await access.getParentKeys({ shareId: undefined, parentUid: 'volumeId~parentNodeid' });
            expect(result).toEqual({ key: 'parentKey' });
            expect(shareService.getSharePrivateKey).not.toHaveBeenCalled();
        });

        it('should get node parent keys even if share is set', async () => {
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));

            const result = await access.getParentKeys({ shareId: 'shareId', parentUid: 'volume1~parentNodeid' });
            expect(result).toEqual({ key: 'parentKey' });
            expect(shareService.getSharePrivateKey).not.toHaveBeenCalled();
        });
    });

    describe('getNodeKeys', () => {
        it('should load node if not cached', async () => {
            cryptoCache.getNodeKeys = jest.fn(() => Promise.reject(new Error('Entity not found')));
            apiService.getNode = jest.fn(() => Promise.reject(new Error('API called')));

            try {
                await access.getNodeKeys('volumeId~nodeId');
                throw new Error('Expected error');
            } catch (error: unknown) {
                expect(`${error}`).toBe('Error: API called');
            }
        });
    });

    describe('getNodePrivateAndSessionKeys', () => {
        it('should return all node keys and session keys', async () => {
            const nodeUid = 'nodeUid';
            const node = {
                uid: nodeUid,
                parentUid: 'volume1~parentNodeid',
                encryptedName: 'encryptedName',
            } as DecryptedNode;

            jest.spyOn(access, 'getNode').mockResolvedValue(node);
            jest.spyOn(access, 'getParentKeys').mockResolvedValue({ key: 'parentKey' } as any);
            jest.spyOn(access, 'getNodeKeys').mockResolvedValue({
                key: 'nodeKey',
                passphrase: 'nodePassphrase',
                passphraseSessionKey: 'nodePassphraseSessionKey',
                contentKeyPacketSessionKey: 'nodeContentKeyPacketSessionKey',
            } as any);
            cryptoService.getNameSessionKey = jest.fn().mockResolvedValue('nameSessionKey');

            const result = await access.getNodePrivateAndSessionKeys(nodeUid);

            expect(result).toEqual({
                key: 'nodeKey',
                passphrase: 'nodePassphrase',
                passphraseSessionKey: 'nodePassphraseSessionKey',
                contentKeyPacketSessionKey: 'nodeContentKeyPacketSessionKey',
                nameSessionKey: 'nameSessionKey',
            });
            expect(access.getNode).toHaveBeenCalledWith(nodeUid);
            expect(access.getParentKeys).toHaveBeenCalledWith(node);
            expect(access.getNodeKeys).toHaveBeenCalledWith(nodeUid);
            expect(cryptoService.getNameSessionKey).toHaveBeenCalledWith(node, 'parentKey');
        });
    });

    describe('getNodeUrl', () => {
        const nodeUid = 'volumeId~nodeId';

        it('should return node URL of document', async () => {
            jest.spyOn(access, 'getNode').mockReturnValue(
                Promise.resolve({ mediaType: 'application/vnd.proton.doc' } as any as DecryptedNode),
            );

            const result = await access.getNodeUrl(nodeUid);
            expect(result).toBe('https://docs.proton.me/doc?type=doc&mode=open&volumeId=volumeId&linkId=nodeId');
        });

        it('should return node URL of sheet', async () => {
            jest.spyOn(access, 'getNode').mockReturnValue(
                Promise.resolve({ mediaType: 'application/vnd.proton.sheet' } as any as DecryptedNode),
            );

            const result = await access.getNodeUrl(nodeUid);
            expect(result).toBe('https://docs.proton.me/doc?type=sheet&mode=open&volumeId=volumeId&linkId=nodeId');
        });

        it('should return node URL of image', async () => {
            jest.spyOn(access, 'getNode').mockReturnValue(
                Promise.resolve({ type: NodeType.File } as any as DecryptedNode),
            );
            jest.spyOn(access as any, 'getRootNode').mockReturnValue(
                Promise.resolve({ shareId: 'shareId', type: NodeType.Folder } as any as DecryptedNode),
            );

            const result = await access.getNodeUrl(nodeUid);
            expect(result).toBe('https://drive.proton.me/shareId/file/nodeId');
        });

        it('should return node URL of folder', async () => {
            jest.spyOn(access, 'getNode').mockReturnValue(
                Promise.resolve({ type: NodeType.Folder } as any as DecryptedNode),
            );
            jest.spyOn(access as any, 'getRootNode').mockReturnValue(
                Promise.resolve({ shareId: 'shareId', type: NodeType.Folder } as any as DecryptedNode),
            );

            const result = await access.getNodeUrl(nodeUid);
            expect(result).toBe('https://drive.proton.me/shareId/folder/nodeId');
        });
    });

    describe('notifyNodeChanged', () => {
        it('should mark node as stale', async () => {
            const node = { uid: 'volumeId~nodeId', isStale: false } as DecryptedNode;
            cache.getNode = jest.fn(() => Promise.resolve(node));
            cache.setNode = jest.fn();
            await access.notifyNodeChanged(node.uid);
            expect(cache.getNode).toHaveBeenCalledWith(node.uid);
            expect(cache.setNode).toHaveBeenCalledWith({ ...node, isStale: true });
        });
        it('should update parent if needed', async () => {
            const node = { uid: 'volumeId~nodeId', parentUid: 'v1~pn1', isStale: false } as DecryptedNode;
            cache.getNode = jest.fn(() => Promise.resolve(node));
            cache.setNode = jest.fn();
            await access.notifyNodeChanged(node.uid, 'v1~pn2');
            expect(cache.getNode).toHaveBeenCalledWith(node.uid);
            expect(cache.setNode).toHaveBeenCalledWith({ ...node, parentUid: 'v1~pn2', isStale: true });
        });
    });

    describe('notifyChildCreated', () => {
        it('should reset parent listing', async () => {
            const nodeUid = 'VolumeId1~NodeId1';
            cache.resetFolderChildrenLoaded = jest.fn();
            await access.notifyChildCreated(nodeUid);
            expect(cache.resetFolderChildrenLoaded).toHaveBeenCalledWith(nodeUid);
        });
    });

    describe('notifyNodeDeleted', () => {
        it('should reset parent listing', async () => {
            await access.notifyNodeDeleted('v1~n1');
            expect(cache.removeNodes).toHaveBeenCalledWith(['v1~n1']);
        });
    });
});
