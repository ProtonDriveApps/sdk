import { MemberRole, NodeType, resultOk } from "../../interface";
import { nodeAPIService, ResultErrors, NodeErrors } from "./apiService.js";
import { nodesCache } from "./cache.js"
import { nodesCryptoCache } from "./cryptoCache.js"
import { nodesCryptoService } from "./cryptoService.js";
import { SharesService, DecryptedNode } from "./interface.js";
import { nodesAccess } from "./nodesAccess.js";
import { makeNodeUid } from "./nodeUid.js";

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
export function nodesManager(
    apiService: ReturnType<typeof nodeAPIService>,
    cache: ReturnType<typeof nodesCache>,
    cryptoCache: ReturnType<typeof nodesCryptoCache>,
    cryptoService: ReturnType<typeof nodesCryptoService>,
    shareService: SharesService,
    nodesAccessFunctions: ReturnType<typeof nodesAccess>,
) {
    async function getMyFilesRootFolder() {
        const { volumeId, rootNodeId } = await shareService.getMyFilesIDs();
        const nodeUid = makeNodeUid(volumeId, rootNodeId);
        return nodesAccessFunctions.getNode(nodeUid);
    }

    // Improvement requested: keep status of loaded children and leverage cache.
    async function *iterateChildren(parentNodeUid: string, signal?: AbortSignal) {
        // Ensure the parent is loaded and up-to-date.
        const parentNode = await nodesAccessFunctions.getNode(parentNodeUid);

        const batchLoading = new BatchNodesLoading(nodesAccessFunctions.loadNodes);
        for await (const nodeUid of apiService.iterateChildrenNodeUids(parentNode.uid, signal)) {
            let node;
            try {
                node = await cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                yield node;
            } else {
                yield* batchLoading.loadNode(nodeUid, signal);
            }
        }
    }

    async function *iterateTrashedNodes(signal?: AbortSignal) {
        const { volumeId } = await shareService.getMyFilesIDs();
        const batchLoading = new BatchNodesLoading(nodesAccessFunctions.loadNodes);
        for await (const nodeUid of apiService.iterateTrashedNodeUids(volumeId, signal)) {
            let node;
            try {
                node = await cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                yield node;
            } else {
                yield* batchLoading.loadNode(nodeUid, signal);
            }
        }
    }

    async function *iterateNodes(nodeUids: string[], signal?: AbortSignal) {
        const batchLoading = new BatchNodesLoading(nodesAccessFunctions.loadNodes);
        for await (const result of cache.iterateNodes(nodeUids)) {
            if (result.ok && !result.node.isStale) {
                yield result.node;
            } else {
                yield* batchLoading.loadNode(result.uid, signal);
            }
        }
    }

    async function renameNode(nodeUid: string, newName: string) {
        const node = await nodesAccessFunctions.getNode(nodeUid);
        const parentKeys = await nodesAccessFunctions.getParentKeys(node);

        if (!node.hash || !parentKeys.hashKey) {
            throw new Error('Renaming root nodes is not supported')
        }

        const {
            signatureEmail,
            armoredNodeName,
            hash,
        } = await cryptoService.encryptNewName(node, { key: parentKeys.key, hashKey: parentKeys.hashKey }, newName);
        await apiService.renameNode(
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
        await cache.setNode({
            ...node,
            name: resultOk(newName),
            nameAuthor: resultOk(signatureEmail),
            hash,
        });
    }

    async function moveNode(nodeUid: string, newParentUid: string) {
        const [node, newParentNode] = await Promise.all([
            nodesAccessFunctions.getNode(nodeUid),
            nodesAccessFunctions.getNode(newParentUid),
        ]);
        const [keys, newParentKeys] = await Promise.all([
            nodesAccessFunctions.getNodeKeys(nodeUid),
            nodesAccessFunctions.getNodeKeys(newParentUid),
        ]);

        if (!node.hash) {
            throw new Error('Moving root nodes is not supported');
        }
        if (!newParentKeys.hashKey) {
            throw new Error('Moving nodes to a non-folder is not supported');
        }

        const encryptedCrypto = await cryptoService.moveNode(
            node,
            keys,
            newParentNode,
            { key: newParentKeys.key, hashKey: newParentKeys.hashKey },
        );
        await apiService.moveNode(
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
        await cache.setNode({
            ...node,
            parentUid: newParentUid,
        });
    }

    async function trashNodes(nodeUids: string[], signal?: AbortSignal) {
        const nodesPerParent = new Map<string, DecryptedNode[]>();

        for await (const node of iterateNodes(nodeUids, signal)) {
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
                await apiService.trashNodes(parentNodeUid, nodes.map(node => node.uid), signal);
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
                await cache.setNode({
                    ...node,
                    trashedDate: new Date(),
                });
            }
        }

        if (Object.keys(errors).length) {
            throw new ResultErrors(errors);
        }
    }

    async function restoreNodes(nodeUids: string[], signal?: AbortSignal) {
        const nodes = await Array.fromAsync(iterateNodes(nodeUids, signal));
        let updatedNodes: DecryptedNode[];
        let catchedError: unknown;

        try {
            await apiService.restoreNodes(nodeUids, signal);
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
            await cache.setNode({
                ...node,
                trashedDate: new Date(),
            });
        }

        if (catchedError) {
            throw catchedError;
        }
    }

    async function deleteNodes(nodeUids: string[], signal?: AbortSignal) {
        let updatedNodeUids: string[];
        let catchedError: unknown;

        try {
            await apiService.restoreNodes(nodeUids, signal);
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
            await cache.removeNodes(updatedNodeUids);
        }

        if (catchedError) {
            throw catchedError;
        }
    }

    async function createFolder(parentNodeUid: string, folderName: string, signal?: AbortSignal) {
        const parentNode = await nodesAccessFunctions.getNode(parentNodeUid);
        const parentKeys = await nodesAccessFunctions.getNodeKeys(parentNodeUid);
        if (!parentKeys.hashKey) {
            throw new Error('Creating folders in non-folders is not supported');
        }

        const { encryptedCrypto, keys } = await cryptoService.createFolder(parentNode, { key: parentKeys.key, hashKey: parentKeys.hashKey }, folderName);
        const nodeUid = await apiService.createFolder(parentNodeUid, {
            armoredKey: encryptedCrypto.armoredKey,
            armoredHashKey: encryptedCrypto.folder.armoredHashKey,
            armoredNodePassphrase: encryptedCrypto.armoredNodePassphrase,
            armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
            signatureEmail: encryptedCrypto.signatureEmail,
            encryptedName: encryptedCrypto.encryptedName,
            hash: encryptedCrypto.hash,
            encryptedExtendedAttributes: encryptedCrypto.folder.encryptedExtendedAttributes || "", // TODO
        }, signal);

        await cache.setNode({
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
        });
        await cryptoCache.setNodeKeys(nodeUid, keys);
    }

    return {
        getMyFilesRootFolder,
        iterateChildren,
        iterateTrashedNodes,
        iterateNodes,
        renameNode,
        moveNode,
        trashNodes,
        restoreNodes,
        deleteNodes,
        createFolder,
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
