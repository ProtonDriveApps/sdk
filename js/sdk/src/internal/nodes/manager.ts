import { MemberRole, NodeType, resultOk } from "../../interface";
import { NodeAPIService, ResultErrors, NodeErrors } from "./apiService";
import { NodesCache } from "./cache";
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { SharesService, DecryptedNode } from "./interface";
import { NodesAccess } from "./nodesAccess";
import { makeNodeUid } from "./nodeUid";

const BATCH_LOADING = 10;

/**
 * Provides high-level actions for managing nodes.
 *
 * The manager is responsible for handling nodes metadata, including
 * API communication, encryption, decryption, and caching.
 *
 * This module uses other modules providing low-level operations, such
 * as API service, cache, crypto service, etc.
 */
export class NodesManager {
    constructor(
        private apiService: NodeAPIService,
        private cache: NodesCache,
        private cryptoCache: NodesCryptoCache,
        private cryptoService: NodesCryptoService,
        private shareService: SharesService,
        private nodesAccess: NodesAccess,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.shareService = shareService;
        this.nodesAccess = nodesAccess;
    }

    async getMyFilesRootFolder() {
        const { volumeId, rootNodeId } = await this.shareService.getMyFilesIDs();
        const nodeUid = makeNodeUid(volumeId, rootNodeId);
        return this.nodesAccess.getNode(nodeUid);
    }

    // Improvement requested: keep status of loaded children and leverage cache.
    async *iterateChildren(parentNodeUid: string, signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        // Ensure the parent is loaded and up-to-date.
        const parentNode = await this.nodesAccess.getNode(parentNodeUid);

        const batchLoading = new BatchNodesLoading(this.nodesAccess.loadNodes);
        for await (const nodeUid of this.apiService.iterateChildrenNodeUids(parentNode.uid, signal)) {
            let node;
            try {
                node = await this.cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                yield node;
            } else {
                yield* batchLoading.loadNode(nodeUid, signal);
            }
        }
    }

    async *iterateTrashedNodes(signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const { volumeId } = await this.shareService.getMyFilesIDs();
        const batchLoading = new BatchNodesLoading(this.nodesAccess.loadNodes);
        for await (const nodeUid of this.apiService.iterateTrashedNodeUids(volumeId, signal)) {
            let node;
            try {
                node = await this.cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                yield node;
            } else {
                yield* batchLoading.loadNode(nodeUid, signal);
            }
        }
    }

    async *iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const batchLoading = new BatchNodesLoading(this.nodesAccess.loadNodes);
        for await (const result of this.cache.iterateNodes(nodeUids)) {
            if (result.ok && !result.node.isStale) {
                yield result.node;
            } else {
                yield* batchLoading.loadNode(result.uid, signal);
            }
        }
    }

    async renameNode(nodeUid: string, newName: string): Promise<void> {
        const node = await this.nodesAccess.getNode(nodeUid);
        const parentKeys = await this.nodesAccess.getParentKeys(node);

        if (!node.hash || !parentKeys.hashKey) {
            throw new Error('Renaming root nodes is not supported')
        }

        const {
            signatureEmail,
            armoredNodeName,
            hash,
        } = await this.cryptoService.encryptNewName(node, { key: parentKeys.key, hashKey: parentKeys.hashKey }, newName);
        await this.apiService.renameNode(
            nodeUid,
            {
                hash: node.hash,
            },
            {
                encryptedName: armoredNodeName,
                nameSignatureEmail: signatureEmail,
                hash: hash,
            }
        );
        await this.cache.setNode({
            ...node,
            name: resultOk(newName),
            nameAuthor: resultOk(signatureEmail),
            hash,
        });
    }

    async moveNode(nodeUid: string, newParentUid: string): Promise<void> {
        const [node, newParentNode] = await Promise.all([
            this.nodesAccess.getNode(nodeUid),
            this.nodesAccess.getNode(newParentUid),
        ]);
        const [keys, newParentKeys] = await Promise.all([
            this.nodesAccess.getNodeKeys(nodeUid),
            this.nodesAccess.getNodeKeys(newParentUid),
        ]);

        if (!node.hash) {
            throw new Error('Moving root nodes is not supported');
        }
        if (!newParentKeys.hashKey) {
            throw new Error('Moving nodes to a non-folder is not supported');
        }

        const encryptedCrypto = await this.cryptoService.moveNode(
            node,
            keys,
            newParentNode,
            { key: newParentKeys.key, hashKey: newParentKeys.hashKey },
        );
        await this.apiService.moveNode(
            nodeUid, 
            {
                hash: node.hash,
            }, 
            {
                parentUid: newParentUid,
                armoredNodePassphrase: encryptedCrypto.armoredNodePassphrase,
                armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
                signatureEmail: encryptedCrypto.signatureEmail,
                encryptedName: encryptedCrypto.encryptedName,
                nameSignatureEmail: encryptedCrypto.nameSignatureEmail,
                hash: encryptedCrypto.hash,
                // TODO: content hash
            }
        );
        await this.cache.setNode({
            ...node,
            parentUid: newParentUid,
        });
    }

    async trashNodes(nodeUids: string[], signal?: AbortSignal): Promise<void> {
        const nodesPerParent = new Map<string, DecryptedNode[]>();

        for await (const node of this.iterateNodes(nodeUids, signal)) {
            if (!node.parentUid) {
                throw new Error('Trashing root nodes is not supported');
            }
            const nodes = nodesPerParent.get(node.parentUid);
            if (nodes) {
                nodes.push(node);
            } else {
                nodesPerParent.set(node.parentUid, [node]);
            }
        }

        let errors: NodeErrors = {};

        for (const [parentNodeUid, nodes] of nodesPerParent) {
            let updatedNodes: DecryptedNode[];
            try {
                await this.apiService.trashNodes(parentNodeUid, nodes.map(node => node.uid), signal);
                updatedNodes = nodes;
            } catch (error: unknown) {
                if (error instanceof ResultErrors) {
                    updatedNodes = nodes.filter(node => !error.failingNodeUids.includes(node.uid));
                    errors = { ...errors, ...error.nodeErrors };
                } else {
                    updatedNodes = [];
                    errors = { ...errors, ...Object.fromEntries(nodes.map(node => [node.uid, error instanceof Error ? error.message : `${error}`])) };
                }
            }
            for (const node of updatedNodes) {
                await this.cache.setNode({
                    ...node,
                    trashedDate: new Date(),
                });
            }
        }

        if (Object.keys(errors).length) {
            throw new ResultErrors(errors);
        }
    }

    async restoreNodes(nodeUids: string[], signal?: AbortSignal): Promise<void> {
        const nodes = await Array.fromAsync(this.iterateNodes(nodeUids, signal));
        let updatedNodes: DecryptedNode[];
        let catchedError: unknown;

        try {
            await this.apiService.restoreNodes(nodeUids, signal);
            updatedNodes = nodes;
        } catch (error: unknown) {
            catchedError = error;
            if (error instanceof ResultErrors) {
                updatedNodes = nodes.filter(node => !error.failingNodeUids.includes(node.uid));
            } else {
                updatedNodes = [];
            }
        }

        for (const node of updatedNodes) {
            await this.cache.setNode({
                ...node,
                trashedDate: new Date(),
            });
        }

        if (catchedError) {
            throw catchedError;
        }
    }

    async deleteNodes(nodeUids: string[], signal?: AbortSignal): Promise<void> {
        let updatedNodeUids: string[];
        let catchedError: unknown;

        try {
            await this.apiService.restoreNodes(nodeUids, signal);
            updatedNodeUids = nodeUids;
        } catch (error: unknown) {
            catchedError = error;
            if (error instanceof ResultErrors) {
                updatedNodeUids = nodeUids.filter(nodeUid => !error.failingNodeUids.includes(nodeUid));
            } else {
                updatedNodeUids = [];
            }
        }

        if (updatedNodeUids) {
            await this.cache.removeNodes(updatedNodeUids);
        }

        if (catchedError) {
            throw catchedError;
        }
    }

    async createFolder(parentNodeUid: string, folderName: string, signal?: AbortSignal): Promise<DecryptedNode> {
        const parentNode = await this.nodesAccess.getNode(parentNodeUid);
        const parentKeys = await this.nodesAccess.getNodeKeys(parentNodeUid);
        if (!parentKeys.hashKey) {
            throw new Error('Creating folders in non-folders is not supported');
        }

        const { encryptedCrypto, keys } = await this.cryptoService.createFolder(parentNode, { key: parentKeys.key, hashKey: parentKeys.hashKey }, folderName);
        const nodeUid = await this.apiService.createFolder(parentNodeUid, {
            armoredKey: encryptedCrypto.armoredKey,
            armoredHashKey: encryptedCrypto.folder.armoredHashKey,
            armoredNodePassphrase: encryptedCrypto.armoredNodePassphrase,
            armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
            signatureEmail: encryptedCrypto.signatureEmail,
            encryptedName: encryptedCrypto.encryptedName,
            hash: encryptedCrypto.hash,
            encryptedExtendedAttributes: encryptedCrypto.folder.encryptedExtendedAttributes || "", // TODO
        }, signal);

        const node: DecryptedNode = {
            // Internal metadata
            volumeId: parentNode.volumeId,
            hash: encryptedCrypto.hash,

            // Basic node metadata
            uid: nodeUid,
            parentUid: parentNodeUid,
            type: NodeType.Folder,
            mimeType: "Folder",
            createdDate: new Date(),

            // Share node metadata
            isShared: false,
            directMemberRole: MemberRole.Admin, // TODO

            // Decrypted metadata
            isStale: false,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.signatureEmail),
            name: resultOk(folderName),
            activeRevision: resultOk(null),
        }

        await this.cache.setNode(node);
        await this.cryptoCache.setNodeKeys(nodeUid, keys);
        return node;
    }
}

/**
 * Helper class for batch loading nodes.
 * 
 * The class is responsible for fetching nodes in batches. Any call to
 * `loadNode` will add the node to the batch (without fetching anything),
 * and if the batch reaches the limit, it will fetch the nodes and yield
 * them transparently to the caller.
 * 
 * Example:
 * 
 * ```typescript
 * const batchLoading = new BatchNodesLoading(loadNodesCallback);
 * for (const nodeUid of nodeUids) {
 *   for await (const node of batchLoading.loadNode(nodeUid)) {
 *     console.log(node);
 *   }
 * }
 * ```
 */
class BatchNodesLoading {
    private nodesToFetch: string[];
    private loadNodes: (nodeUids: string[], signal?: AbortSignal) => Promise<DecryptedNode[]>;

    constructor(loadNodes: (nodeUids: string[]) => Promise<DecryptedNode[]>) {
        this.nodesToFetch = [];
        this.loadNodes = loadNodes;
    }

    async *loadNode(nodeUid: string, signal?: AbortSignal) {
        this.nodesToFetch.push(nodeUid);

        if (this.nodesToFetch.length >= BATCH_LOADING) {
            const nodes = await this.loadNodes(this.nodesToFetch, signal);
            for (const node of nodes) {
                yield node;
            }
            this.nodesToFetch = [];
        }
    }
}
