import { c } from 'ttag';

import { PrivateKey, SessionKey } from "../../crypto";
import { Logger, MissingNode, NodeType, resultError, resultOk } from "../../interface";
import { DecryptionError } from "../../errors";
import { getErrorMessage } from '../errors';
import { BatchLoading } from "../batchLoading";
import { makeNodeUid } from "../uids";
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache"
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { parseFileExtendedAttributes, parseFolderExtendedAttributes } from "./extendedAttributes";
import { SharesService, EncryptedNode, DecryptedUnparsedNode, DecryptedNode, DecryptedNodeKeys } from "./interface";
import { validateNodeName } from "./validations";

/**
 * Provides access to node metadata.
 * 
 * The node access module is responsible for fetching, decrypting and caching
 * nodes metadata.
 */
export class NodesAccess {
    constructor(
        private logger: Logger,
        private apiService: NodeAPIService,
        private cache: NodesCache,
        private cryptoCache: NodesCryptoCache,
        private cryptoService: NodesCryptoService,
        private shareService: SharesService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.shareService = shareService;
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

        this.logger.debug(`Node ${nodeUid} is ${cachedNode?.isStale ? 'stale' : 'not cached'}`);

        const { node } = await this.loadNode(nodeUid);
        return node;
    }

    async *iterateFolderChildren(parentNodeUid: string, signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
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

        this.logger.debug(`Folder ${parentNodeUid} children are not cached`);
        for await (const nodeUid of this.apiService.iterateChildrenNodeUids(parentNode.uid, signal)) {
            let node;
            try {
                node = await this.cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                yield node;
            } else {
                this.logger.debug(`Node ${nodeUid} from ${parentNodeUid} is ${node?.isStale ? 'stale' : 'not cached'}`);
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
                this.logger.debug(`Node ${nodeUid} trom trash is ${node?.isStale ? 'stale' : 'not cached'}`);
                yield* batchLoading.load(nodeUid);
            }
        }
        yield* batchLoading.loadRest();
    }

    async *iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode | MissingNode> {
        const batchLoading = new BatchLoading<string, DecryptedNode | MissingNode>({ iterateItems: (nodeUids) => this.loadNodesWithMissingReport(nodeUids, signal) });
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
        for await (const result of this.loadNodesWithMissingReport(nodeUids, signal)) {
            if ('missingUid' in result) {
                continue;
            }
            yield result;
        }
    }

    private async* loadNodesWithMissingReport(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode | MissingNode> {
        const returnedNodeUids: string[] = [];

        for await (const encryptedNode of this.apiService.iterateNodes(nodeUids, signal)) {
            returnedNodeUids.push(encryptedNode.uid);
            const { node } = await this.decryptNode(encryptedNode);
            yield node;
        }

        const missingNodeUids = nodeUids.filter((nodeUid) => !returnedNodeUids.includes(nodeUid));

        if (missingNodeUids.length) {
            this.logger.debug(`Removing ${missingNodeUids.length} nodes from cache not existing on the API anymore`);
            await this.cache.removeNodes(missingNodeUids);
            for (const missingNodeUid of missingNodeUids) {
                yield { missingUid: missingNodeUid };
            }
        }
    }

    private async decryptNode(encryptedNode: EncryptedNode): Promise<{ node: DecryptedNode, keys?: DecryptedNodeKeys }> {
        let parentKey;
        try {
            const parentKeys = await this.getParentKeys(encryptedNode);
            parentKey = parentKeys.key;
        } catch (error: unknown) {
            if (error instanceof DecryptionError) {
                return {
                    node: {
                        ...encryptedNode,
                        isStale: false,
                        name: resultError({
                            name: '',
                            error: getErrorMessage(error),
                        }),
                        keyAuthor: resultError({
                            claimedAuthor: encryptedNode.encryptedCrypto.signatureEmail,
                            error: getErrorMessage(error),
                        }),
                        nameAuthor: resultError({
                            claimedAuthor: encryptedNode.encryptedCrypto.nameSignatureEmail,
                            error: getErrorMessage(error),
                        }),
                        errors: [error],
                    },
                };
            }
            throw error;
        }

        const { node: unparsedNode, keys } = await this.cryptoService.decryptNode(encryptedNode, parentKey);
        const node = await this.parseNode(unparsedNode);
        try {
            await this.cache.setNode(node);
        } catch (error: unknown) {
            this.logger.error(`Failed to cache node ${node.uid}`, error);
        }
        if (keys) {
            try {
                await this.cryptoCache.setNodeKeys(node.uid, keys);
            } catch (error: unknown) {
                this.logger.error(`Failed to cache node keys ${node.uid}`, error);
            }
        }
        return { node, keys };
    }

    private async parseNode(unparsedNode: DecryptedUnparsedNode): Promise<DecryptedNode> {
        if (unparsedNode.name.ok) {
            try {
                validateNodeName(unparsedNode.name.value);
            } catch (error: unknown) {
                this.logger.warn(`Node name validation failed: ${error instanceof Error ? error.message : error}`);
                unparsedNode.name = resultError({
                    name: unparsedNode.name.value,
                    error: error instanceof Error ? error.message : c('Error').t`Unknown error`,
                });
            }
        }

        if (unparsedNode.type === NodeType.File) {
            const extendedAttributes = unparsedNode.activeRevision?.ok
                ? parseFileExtendedAttributes(this.logger, unparsedNode.activeRevision.value.extendedAttributes)
                : undefined;

            return {
                ...unparsedNode,
                isStale: false,
                activeRevision: !unparsedNode.activeRevision?.ok ? unparsedNode.activeRevision : resultOk({
                    uid: unparsedNode.activeRevision.value.uid,
                    state: unparsedNode.activeRevision.value.state,
                    createdDate: unparsedNode.activeRevision.value.createdDate,
                    contentAuthor: unparsedNode.activeRevision.value.contentAuthor,
                    thumbnails: unparsedNode.activeRevision.value.thumbnails,
                    ...extendedAttributes,
                }),
                folder: undefined,
            }
        }

        const extendedAttributes = unparsedNode.folder?.extendedAttributes
            ? parseFolderExtendedAttributes(this.logger, unparsedNode.folder.extendedAttributes)
            : undefined;
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
            try {
                return await this.getNodeKeys(node.parentUid);
            } catch (error: unknown) {
                if (error instanceof DecryptionError) {
                    // Change the error message to be more specific.
                    // Original error message is referring to node, while here
                    // it referes to as parent to follow the method context.
                    throw new DecryptionError(c('Error').t`Parent cannot be decrypted`);
                }
                throw error;
            }
        }
        if (node.shareId) {
            return {
                key: await this.shareService.getSharePrivateKey(node.shareId),
            }
        }
        // This is bug that should not happen.
        // API cannot provide node without parent or share.
        throw new Error('Node has neither parent node nor share');
    }

    async getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        try {
            return await this.cryptoCache.getNodeKeys(nodeUid);
        } catch {
            const { keys } = await this.loadNode(nodeUid);
            if (!keys) {
                throw new DecryptionError(c('Error').t`Item cannot be decrypted`);
            }
            return keys;
        }
    }

    async getNodePrivateAndSessionKeys(nodeUid: string): Promise<{
        key: PrivateKey,
        passphraseSessionKey: SessionKey,
        contentKeyPacketSessionKey: SessionKey,
        nameSessionKey: SessionKey,
    }> {
        const node = await this.getNode(nodeUid);
        const { key: parentKey } = await this.getParentKeys(node);
        const { key, passphraseSessionKey, contentKeyPacketSessionKey } = await this.getNodeKeys(nodeUid);
        const nameSessionKey = await this.cryptoService.getNameSessionKey(node, parentKey);
        return {
            key,
            passphraseSessionKey,
            contentKeyPacketSessionKey,
            nameSessionKey,
        };
    }
}
