import { Logger, NodeType, resultOk } from "../../interface";
import { BatchLoading } from "../batchLoading";
import { makeNodeUid } from "../uids";
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache"
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { parseFileExtendedAttributes, parseFolderExtendedAttributes } from "./extendedAttributes";
import { SharesService, EncryptedNode, DecryptedUnparsedNode, DecryptedNode, DecryptedNodeKeys } from "./interface";

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
        private log?: Logger,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.shareService = shareService;
        this.log = log;
    }

    async getMyFilesRootFolder() {
        const { volumeId, rootNodeId } = await this.shareService.getMyFilesIDs();
        const nodeUid = makeNodeUid(volumeId, rootNodeId);
        return this.getNode(nodeUid);
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

    async *iterateChildren(parentNodeUid: string, signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        // Ensure the parent is loaded and up-to-date.
        const parentNode = await this.getNode(parentNodeUid);

        const batchLoading = new BatchLoading<string, DecryptedNode>({ iterateItems: (nodeUids) => this.loadNodes(nodeUids, signal) });

        const areChildrenCached = await this.cache.isFolderChildrenLoaded(parentNodeUid);
        if (areChildrenCached) {
            for await (const node of this.cache.iterateChildren(parentNodeUid)) {
                if (node.ok && !node.node.isStale) {
                    yield node.node;
                } else {
                    yield* batchLoading.load(node.uid);
                }
            }
            yield* batchLoading.loadRest();
            return;
        }

        for await (const nodeUid of this.apiService.iterateChildrenNodeUids(parentNode.uid, signal)) {
            let node;
            try {
                node = await this.cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                yield node;
            } else {
                yield* batchLoading.load(nodeUid);
            }
        }
        yield* batchLoading.loadRest();
        await this.cache.setFolderChildrenLoaded(parentNodeUid);
    }

    // Improvement requested: keep status of loaded trash and leverage cache.
    async *iterateTrashedNodes(signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const { volumeId } = await this.shareService.getMyFilesIDs();
        const batchLoading = new BatchLoading<string, DecryptedNode>({ iterateItems: (nodeUids) => this.loadNodes(nodeUids, signal) });
        for await (const nodeUid of this.apiService.iterateTrashedNodeUids(volumeId, signal)) {
            let node;
            try {
                node = await this.cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                yield node;
            } else {
                yield* batchLoading.load(nodeUid);
            }
        }
        yield* batchLoading.loadRest();
    }

    async *iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const batchLoading = new BatchLoading<string, DecryptedNode>({ iterateItems: (nodeUids) => this.loadNodes(nodeUids, signal) });
        for await (const result of this.cache.iterateNodes(nodeUids)) {
            if (result.ok && !result.node.isStale) {
                yield result.node;
            } else {
                yield* batchLoading.load(result.uid);
            }
        }
        yield* batchLoading.loadRest();
    }

    private async loadNode(nodeUid: string): Promise<{ node: DecryptedNode, keys?: DecryptedNodeKeys }> {
        const encryptedNode = await this.apiService.getNode(nodeUid);
        return this.decryptNode(encryptedNode);
    }

    private async* loadNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const encryptedNodes = await this.apiService.getNodes(nodeUids, signal);
        for (const encryptedNode of encryptedNodes) {
            const { node } = await this.decryptNode(encryptedNode);
            yield node;
        }
    }

    private async decryptNode(encryptedNode: EncryptedNode): Promise<{ node: DecryptedNode, keys?: DecryptedNodeKeys }> {
        const { key: parentKey } = await this.getParentKeys(encryptedNode);
        const { node: unparsedNode, keys } = await this.cryptoService.decryptNode(encryptedNode, parentKey);
        const node = await this.parseNode(unparsedNode);
        this.cache.setNode(node);
        if (keys) {
            this.cryptoCache.setNodeKeys(node.uid, keys);
        }
        return { node, keys };
    }

    private async parseNode(unparsedNode: DecryptedUnparsedNode): Promise<DecryptedNode> {
        if (unparsedNode.type === NodeType.File) {
            const extendedAttributes = unparsedNode.activeRevision?.ok ? parseFileExtendedAttributes(unparsedNode.activeRevision.value.extendedAttributes, this.log) : undefined;

            return {
                ...unparsedNode,
                isStale: false,
                activeRevision: !unparsedNode.activeRevision?.ok ? unparsedNode.activeRevision : resultOk({
                    uid: unparsedNode.activeRevision.value.uid,
                    state: unparsedNode.activeRevision.value.state,
                    createdDate: unparsedNode.activeRevision.value.createdDate,
                    author: unparsedNode.activeRevision.value.author,
                    ...extendedAttributes,
                }),
                folder: undefined,
            }
        }

        const extendedAttributes = unparsedNode.folder?.extendedAttributes ? parseFolderExtendedAttributes(unparsedNode.folder.extendedAttributes, this.log) : undefined;
        return {
            ...unparsedNode,
            isStale: false,
            activeRevision: undefined,
            folder: extendedAttributes ? {
                ...extendedAttributes,
            } : undefined,
        }
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
            return await this.cryptoCache.getNodeKeys(nodeUid);
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
