import { nodeAPIService } from "./apiService";
import { nodesCache } from "./cache"
import { nodesCryptoCache } from "./cryptoCache";
import { nodesCryptoService } from "./cryptoService";
import { SharesService, EncryptedNode, DecryptedNode, DecryptedNodeKeys } from "./interface";

/**
 * Provides access to node metadata.
 * 
 * The node access module is responsible for fetching, decrypting and caching
 * nodes metadata.
 */
export function nodesAccess(
    apiService: ReturnType<typeof nodeAPIService>,
    cache: ReturnType<typeof nodesCache>,
    cryptoCache: ReturnType<typeof nodesCryptoCache>,
    cryptoService: ReturnType<typeof nodesCryptoService>,
    shareService: SharesService,
) {
    async function getNode(nodeUid: string) {
        let cachedNode;
        try {
            cachedNode = await cache.getNode(nodeUid);
        } catch {}

        if (cachedNode && !cachedNode.isStale) {
            return cachedNode;
        }

        const { node } = await loadNode(nodeUid);
        return node;
    }

    async function loadNode(nodeUid: string) {
        const encryptedNode = await apiService.getNode(nodeUid);
        return decryptNode(encryptedNode);
    }

    async function loadNodes(nodeUids: string[], signal?: AbortSignal) {
        // TODO: batching
        const encryptedNodes = await apiService.getNodes(nodeUids, signal);
        const results = await Promise.all(encryptedNodes.map(decryptNode));
        return results.map(({ node }) => node);
    }

    async function decryptNode(encryptedNode: EncryptedNode) {
        const { key: parentKey } = await getParentKeys(encryptedNode);
        const { node, keys } = await cryptoService.decryptNode(encryptedNode, parentKey);
        cache.setNode(node);
        if (keys) {
            cryptoCache.setNodeKeys(node.uid, keys);
        }
        return { node, keys };
    }

    async function getParentKeys(node: Pick<DecryptedNode, 'parentUid' | 'shareId'>): Promise<Pick<DecryptedNodeKeys, 'key' | 'hashKey'>> {
        if (node.parentUid) {
            return getNodeKeys(node.parentUid);
        }
        if (!node.shareId) {
            // TODO: better error message
            throw new Error('Node tree has no parent to access the keys');
        }
        return {
            key: await shareService.getSharePrivateKey(node.shareId),
        }
    }

    async function getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        try {
            return cryptoCache.getNodeKeys(nodeUid);
        } catch {
            const { keys } = await loadNode(nodeUid);
            if (!keys) {
                // TODO: better error message
                throw new Error('Parent node cannot be decrypted');
            }
            return keys;
        }
    }

    return {
        getNode,
        getParentKeys,
        getNodeKeys,
        loadNodes,
    }
}
