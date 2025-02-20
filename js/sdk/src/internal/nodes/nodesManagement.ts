import { MemberRole, NodeType, NodeResult, resultOk } from "../../interface";
import { AbortError } from "../errors";
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache";
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { DecryptedNode } from "./interface";
import { NodesAccess } from "./nodesAccess";

/**
 * Provides high-level actions for managing nodes.
 *
 * The manager is responsible for handling nodes metadata, including
 * API communication, encryption, decryption, and caching.
 *
 * This module uses other modules providing low-level operations, such
 * as API service, cache, crypto service, etc.
 */
export class NodesManagement {
    constructor(
        private apiService: NodeAPIService,
        private cache: NodesCache,
        private cryptoCache: NodesCryptoCache,
        private cryptoService: NodesCryptoService,
        private nodesAccess: NodesAccess,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.nodesAccess = nodesAccess;
    }

    async renameNode(nodeUid: string, newName: string): Promise<DecryptedNode> {
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
        const newNode: DecryptedNode = {
            ...node,
            name: resultOk(newName),
            nameAuthor: resultOk(signatureEmail),
            hash,
        }
        await this.cache.setNode(newNode);
        return newNode;
    }

    // Improvement requested: move nodes in parallel
    async* moveNodes(nodeUids: string[], newParentNodeUid: string, signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for (const nodeUid of nodeUids) {
            if (signal?.aborted) {
                throw new AbortError('Move operation aborted');
            }
            try {
                await this.moveNode(nodeUid, newParentNodeUid);
                yield {
                    uid: nodeUid,
                    ok: true,
                }
            } catch (error: unknown) {
                yield {
                    uid: nodeUid,
                    ok: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                }
            }
        }
    }

    async moveNode(nodeUid: string, newParentUid: string): Promise<DecryptedNode> {
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
        const newNode: DecryptedNode = {
            ...node,
            parentUid: newParentUid,
            hash: encryptedCrypto.hash,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.nameSignatureEmail),
        };
        await this.cache.setNode(newNode);
        return newNode;
    }

    async* trashNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodesPerParent = new Map<string, DecryptedNode[]>();

        for await (const node of this.nodesAccess.iterateNodes(nodeUids, signal)) {
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

        for (const [parentNodeUid, nodes] of nodesPerParent) {
            for await (const result of this.apiService.trashNodes(parentNodeUid, nodes.map(node => node.uid), signal)) {
                if (result.ok) {
                    const node = nodes.find(node => node.uid === result.uid);
                    if (node) {
                        await this.cache.setNode({
                            ...node,
                            trashedDate: new Date(),
                        });
                    }
                }

                yield result;
            }
        }
    }

    async* restoreNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodes = await Array.fromAsync(this.nodesAccess.iterateNodes(nodeUids, signal));

        for await (const result of this.apiService.restoreNodes(nodeUids, signal)) {
            if (result.ok) {
                const node = nodes.find(node => node.uid === result.uid);
                if (node) {
                    await this.cache.setNode({
                        ...node,
                        trashedDate: undefined,
                    });
                }
            }

            yield result;
        }
    }

    async* deleteNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const deletedNodeUids = [];

        for await (const result of this.apiService.deleteNodes(nodeUids, signal)) {
            if (result.ok) {
                deletedNodeUids.push(result.uid);
            }
            yield result;
        }

        await this.cache.removeNodes(deletedNodeUids);
    }

    async createFolder(parentNodeUid: string, folderName: string): Promise<DecryptedNode> {
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
        });

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
        }

        await this.cache.setNode(node);
        await this.cryptoCache.setNodeKeys(nodeUid, keys);
        return node;
    }
}
