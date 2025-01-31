import { PrivateKey } from "../../crypto";
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache"
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { NodesAccess } from './nodesAccess';
import { SharesService, DecryptedNode, EncryptedNode, DecryptedNodeKeys } from "./interface";

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
        }
        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            getNode: jest.fn(),
            setNode: jest.fn(),
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

        access = new NodesAccess(apiService, cache, cryptoCache, cryptoService, shareService);
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
            const decryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.resolve({ uid: 'nodeId', isStale: true } as DecryptedNode));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() => Promise.resolve({ node: decryptedNode, keys: decryptedKeys }));

            const result = await access.getNode('nodeId');
            expect(result).toBe(decryptedNode);
            expect(apiService.getNode).toHaveBeenCalledWith('nodeId');
            expect(cryptoCache.getNodeKeys).toHaveBeenCalledWith('parentUid');
            expect(cryptoService.decryptNode).toHaveBeenCalledWith(encryptedNode, 'parentKey');
            expect(cache.setNode).toHaveBeenCalledWith(decryptedNode);
            expect(cryptoCache.setNodeKeys).toHaveBeenCalledWith('nodeId', decryptedKeys);
        });

        it('should get node from API missing cache', async () => {
            const encryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as EncryptedNode;
            const decryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as DecryptedNode;
            const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

            cache.getNode = jest.fn(() => Promise.reject(new Error('Entity not found')));
            apiService.getNode = jest.fn(() => Promise.resolve(encryptedNode));
            cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
            cryptoService.decryptNode = jest.fn(() => Promise.resolve({ node: decryptedNode, keys: decryptedKeys }));

            const result = await access.getNode('nodeId');
            expect(result).toBe(decryptedNode);
            expect(apiService.getNode).toHaveBeenCalledWith('nodeId');
            expect(cryptoCache.getNodeKeys).toHaveBeenCalledWith('parentUid');
            expect(cryptoService.decryptNode).toHaveBeenCalledWith(encryptedNode, 'parentKey');
            expect(cache.setNode).toHaveBeenCalledWith(decryptedNode);
            expect(cryptoCache.setNodeKeys).toHaveBeenCalledWith('nodeId', decryptedKeys);
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

    it('should load node without accessing cache first', async () => {
        const encryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as EncryptedNode;
        const decryptedNode = { uid: 'nodeId', parentUid: 'parentUid' } as DecryptedNode;
        const decryptedKeys = { key: 'key' } as any as DecryptedNodeKeys;

        apiService.getNodes = jest.fn(() => Promise.resolve([encryptedNode]));
        cryptoCache.getNodeKeys = jest.fn(() => Promise.resolve({ key: 'parentKey' } as any as DecryptedNodeKeys));
        cryptoService.decryptNode = jest.fn(() => Promise.resolve({ node: decryptedNode, keys: decryptedKeys }));

        const result = await access.loadNodes(['nodeId']);
        expect(result).toEqual([decryptedNode]);
        expect(cache.getNode).not.toHaveBeenCalled();
        expect(cache.setNode).toHaveBeenCalledWith(decryptedNode);
        expect(cryptoCache.setNodeKeys).toHaveBeenCalledWith('nodeId', decryptedKeys);
    });
});
