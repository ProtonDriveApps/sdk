import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache"
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { SharesService, EncryptedNode, DecryptedNode, DecryptedNodeKeys } from "./interface";

/**
 * Provides access to node metadata.
 * 
 * The node access module is responsible for fetching, decrypting and caching
 * nodes metadata.
 */
export class NodesAccess {
    constructor(
        private apiService: NodeAPIService,
        private cache: NodesCache,
        private cryptoCache: NodesCryptoCache,
        private cryptoService: NodesCryptoService,
        private shareService: SharesService,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.shareService = shareService;
    }

    async getNode(nodeUid: string): Promise<DecryptedNode> {
        let cachedNode;
        try {
            cachedNode = await this.cache.getNode(nodeUid);
        } catch {}

        if (cachedNode && !cachedNode.isStale) {
            return cachedNode;
        }

        const { node } = await this.loadNode(nodeUid);
        return node;
    }

    private async loadNode(nodeUid: string): Promise<{ node: DecryptedNode, keys?: DecryptedNodeKeys }> {
        const encryptedNode = await this.apiService.getNode(nodeUid);
        return this.decryptNode(encryptedNode);
    }

    async loadNodes(nodeUids: string[], signal?: AbortSignal): Promise<DecryptedNode[]> {
        // TODO: batching
        const encryptedNodes = await this.apiService.getNodes(nodeUids, signal);
        const results = await Promise.all(encryptedNodes.map((encryptedNode) => this.decryptNode(encryptedNode)));
        return results.map(({ node }) => node);
    }

    private async decryptNode(encryptedNode: EncryptedNode): Promise<{ node: DecryptedNode, keys?: DecryptedNodeKeys }> {
        const { key: parentKey } = await this.getParentKeys(encryptedNode);
        const { node, keys } = await this.cryptoService.decryptNode(encryptedNode, parentKey);
        this.cache.setNode(node);
        if (keys) {
            this.cryptoCache.setNodeKeys(node.uid, keys);
        }
        return { node, keys };
    }

    async getParentKeys(node: Pick<DecryptedNode, 'parentUid' | 'shareId'>): Promise<Pick<DecryptedNodeKeys, 'key' | 'hashKey'>> {
        if (node.parentUid) {
            return this.getNodeKeys(node.parentUid);
        }
        if (!node.shareId) {
            // TODO: better error message
            throw new Error('Node tree has no parent to access the keys');
        }
        return {
            key: await this.shareService.getSharePrivateKey(node.shareId),
        }
    }

    async getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        try {
            return this.cryptoCache.getNodeKeys(nodeUid);
        } catch {
            const { keys } = await this.loadNode(nodeUid);
            if (!keys) {
                // TODO: better error message
                throw new Error('Parent node cannot be decrypted');
            }
            return keys;
        }
    }
}
