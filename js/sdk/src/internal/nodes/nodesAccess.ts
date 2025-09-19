import { c } from 'ttag';

import { PrivateKey, SessionKey } from '../../crypto';
import { InvalidNameError, Logger, MissingNode, NodeType, Result, resultError, resultOk } from '../../interface';
import { DecryptionError, ProtonDriveError } from '../../errors';
import { asyncIteratorMap } from '../asyncIteratorMap';
import { getErrorMessage } from '../errors';
import { BatchLoading } from '../batchLoading';
import { makeNodeUid, splitNodeUid } from '../uids';
import { NodeAPIService } from './apiService';
import { NodesCache } from './cache';
import { NodesCryptoCache } from './cryptoCache';
import { NodesCryptoService } from './cryptoService';
import { parseFileExtendedAttributes, parseFolderExtendedAttributes } from './extendedAttributes';
import {
    SharesService,
    EncryptedNode,
    DecryptedUnparsedNode,
    DecryptedNode,
    DecryptedNodeKeys,
    FilterOptions,
} from './interface';
import { validateNodeName } from './validations';
import { isProtonDocument, isProtonSheet } from './mediaTypes';

// This is the number of nodes that are loaded in parallel.
// It is a trade-off between initial wait time and overhead of API calls.
const BATCH_LOADING_SIZE = 30;

// This is the number of nodes that are decrypted in parallel.
// It is a trade-off between performance and memory usage.
// Higher number means more memory usage, but faster decryption.
// Lower number means less memory usage, but slower decryption.
const DECRYPTION_CONCURRENCY = 30;

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

    async getVolumeRootFolder() {
        const { volumeId, rootNodeId } = await this.shareService.getOwnVolumeIDs();
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

    async *iterateFolderChildren(
        parentNodeUid: string,
        filterOptions?: FilterOptions,
        signal?: AbortSignal,
    ): AsyncGenerator<DecryptedNode> {
        // Ensure the parent is loaded and up-to-date.
        const parentNode = await this.getNode(parentNodeUid);

        const batchLoading = new BatchLoading<string, DecryptedNode>({
            iterateItems: (nodeUids) => this.loadNodes(nodeUids, filterOptions, signal),
            batchSize: BATCH_LOADING_SIZE,
        });

        const areChildrenCached = await this.cache.isFolderChildrenLoaded(parentNodeUid);
        if (areChildrenCached) {
            for await (const node of this.cache.iterateChildren(parentNodeUid)) {
                if (node.ok && !node.node.isStale) {
                    if (filterOptions?.type && node.node.type !== filterOptions.type) {
                        continue;
                    }
                    yield node.node;
                } else {
                    yield* batchLoading.load(node.uid);
                }
            }
            yield* batchLoading.loadRest();
            return;
        }

        this.logger.debug(`Folder ${parentNodeUid} children are not cached`);
        const onlyFolders = filterOptions?.type === NodeType.Folder;
        for await (const nodeUid of this.apiService.iterateChildrenNodeUids(parentNode.uid, onlyFolders, signal)) {
            let node;
            try {
                node = await this.cache.getNode(nodeUid);
            } catch {}

            if (node && !node.isStale) {
                if (filterOptions?.type && node.type !== filterOptions.type) {
                    continue;
                }
                yield node;
            } else {
                this.logger.debug(`Node ${nodeUid} from ${parentNodeUid} is ${node?.isStale ? 'stale' : 'not cached'}`);
                yield* batchLoading.load(nodeUid);
            }
        }
        yield* batchLoading.loadRest();

        // If some nodes were filtered out, we don't have the folder fully loaded.
        if (!filterOptions) {
            await this.cache.setFolderChildrenLoaded(parentNodeUid);
        }
    }

    // Improvement requested: keep status of loaded trash and leverage cache.
    async *iterateTrashedNodes(signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const { volumeId } = await this.shareService.getOwnVolumeIDs();
        const batchLoading = new BatchLoading<string, DecryptedNode>({
            iterateItems: (nodeUids) => this.loadNodes(nodeUids, undefined, signal),
            batchSize: BATCH_LOADING_SIZE,
        });
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
        const batchLoading = new BatchLoading<string, DecryptedNode | MissingNode>({
            iterateItems: (nodeUids) => this.loadNodesWithMissingReport(nodeUids, undefined, signal),
            batchSize: BATCH_LOADING_SIZE,
        });
        for await (const result of this.cache.iterateNodes(nodeUids)) {
            if (result.ok && !result.node.isStale) {
                yield result.node;
            } else {
                yield* batchLoading.load(result.uid);
            }
        }
        yield* batchLoading.loadRest();
    }

    /**
     * Call to invalidate the folder listing cache. This should be refactored into a clean
     * cache layer once the cache is split off.
     */
    async notifyChildCreated(nodeUid: string): Promise<void> {
        await this.cache.resetFolderChildrenLoaded(nodeUid);
    }

    /**
     * Call to invalidate the node cache when a node changes. Parent can be set after a move
     * to ensure parent listing of new parent is up to date if cached.
     * This should be refactored into a clean cache layer once the cache is split off.
     */
    async notifyNodeChanged(nodeUid: string, newParentUid?: string): Promise<void> {
        try {
            const node = await this.cache.getNode(nodeUid);
            if (node.isStale && newParentUid === null) {
                return;
            }
            node.isStale = true;
            if (newParentUid) {
                node.parentUid = newParentUid;
            }
            await this.cache.setNode(node);
        } catch (error: unknown) {
            this.logger.warn(`Failed to set node ${nodeUid} as stale after sharing: ${error}`);
        }
    }

    /**
     * Call to remove a node from cache. This should be refactored when the cache is split off.
     */
    async notifyNodeDeleted(nodeUid: string): Promise<void> {
        await this.cache.removeNodes([nodeUid]);
    }

    private async loadNode(nodeUid: string): Promise<{ node: DecryptedNode; keys?: DecryptedNodeKeys }> {
        const { volumeId: ownVolumeId } = await this.shareService.getOwnVolumeIDs();
        const encryptedNode = await this.apiService.getNode(nodeUid, ownVolumeId);
        return this.decryptNode(encryptedNode);
    }

    private async *loadNodes(
        nodeUids: string[],
        filterOptions?: FilterOptions,
        signal?: AbortSignal,
    ): AsyncGenerator<DecryptedNode> {
        for await (const result of this.loadNodesWithMissingReport(nodeUids, filterOptions, signal)) {
            if ('missingUid' in result) {
                continue;
            }
            yield result;
        }
    }

    private async *loadNodesWithMissingReport(
        nodeUids: string[],
        filterOptions?: FilterOptions,
        signal?: AbortSignal,
    ): AsyncGenerator<DecryptedNode | MissingNode> {
        const returnedNodeUids: string[] = [];
        const errors = [];

        const { volumeId: ownVolumeId } = await this.shareService.getOwnVolumeIDs();

        const encryptedNodesIterator = this.apiService.iterateNodes(nodeUids, ownVolumeId, filterOptions, signal);
        const decryptNodeMapper = async (encryptedNode: EncryptedNode): Promise<Result<DecryptedNode, unknown>> => {
            returnedNodeUids.push(encryptedNode.uid);
            try {
                const { node } = await this.decryptNode(encryptedNode);
                return resultOk(node);
            } catch (error: unknown) {
                return resultError(error);
            }
        };
        const decryptedNodesIterator = asyncIteratorMap(
            encryptedNodesIterator,
            decryptNodeMapper,
            DECRYPTION_CONCURRENCY,
        );
        for await (const node of decryptedNodesIterator) {
            if (node.ok) {
                yield node.value;
            } else {
                errors.push(node.error);
            }
        }

        if (errors.length > 0) {
            this.logger.error(`Failed to decrypt ${errors.length} nodes`, errors);
            throw new DecryptionError(c('Error').t`Failed to decrypt some nodes`, { cause: errors });
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

    private async decryptNode(
        encryptedNode: EncryptedNode,
    ): Promise<{ node: DecryptedNode; keys?: DecryptedNodeKeys }> {
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
                        name: resultError(error),
                        keyAuthor: resultError({
                            claimedAuthor: encryptedNode.encryptedCrypto.signatureEmail,
                            error: getErrorMessage(error),
                        }),
                        nameAuthor: resultError({
                            claimedAuthor: encryptedNode.encryptedCrypto.nameSignatureEmail,
                            error: getErrorMessage(error),
                        }),
                        membership: encryptedNode.membership
                            ? {
                                  role: encryptedNode.membership.role,
                                  inviteTime: encryptedNode.membership.inviteTime,
                                  sharedBy: resultError({
                                      claimedAuthor: encryptedNode.encryptedCrypto.membership?.inviterEmail,
                                      error: getErrorMessage(error),
                                  }),
                              }
                            : undefined,
                        errors: [error],
                        treeEventScopeId: splitNodeUid(encryptedNode.uid).volumeId,
                    },
                };
            }
            throw error;
        }

        const { node: unparsedNode, keys } = await this.cryptoService.decryptNode(encryptedNode, parentKey);
        const node = await parseNode(this.logger, unparsedNode);
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

    async getParentKeys(
        node: Pick<DecryptedNode, 'parentUid' | 'shareId'>,
    ): Promise<Pick<DecryptedNodeKeys, 'key' | 'hashKey'>> {
        if (node.parentUid) {
            try {
                return await this.getNodeKeys(node.parentUid);
            } catch (error: unknown) {
                if (error instanceof DecryptionError) {
                    // Change the error message to be more specific.
                    // Original error message is referring to node, while here
                    // it referes to as parent to follow the method context.
                    throw new DecryptionError(c('Error').t`Parent cannot be decrypted`, { cause: error });
                }
                throw error;
            }
        }
        if (node.shareId) {
            return {
                key: await this.shareService.getSharePrivateKey(node.shareId),
            };
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
        key: PrivateKey;
        passphrase: string;
        passphraseSessionKey: SessionKey;
        contentKeyPacketSessionKey?: SessionKey;
        nameSessionKey: SessionKey;
    }> {
        const node = await this.getNode(nodeUid);
        const { key: parentKey } = await this.getParentKeys(node);
        const { key, passphrase, passphraseSessionKey, contentKeyPacketSessionKey } = await this.getNodeKeys(nodeUid);
        const nameSessionKey = await this.cryptoService.getNameSessionKey(node, parentKey);
        return {
            key,
            passphrase,
            passphraseSessionKey,
            contentKeyPacketSessionKey,
            nameSessionKey,
        };
    }

    async getRootNodeEmailKey(nodeUid: string): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }> {
        const rootNode = await this.getRootNode(nodeUid);
        if (!rootNode.shareId) {
            throw new Error(`Node "${nodeUid}" is not accessible - missing root shareId`);
        }
        return this.shareService.getContextShareMemberEmailKey(rootNode.shareId);
    }

    async getNodeUrl(nodeUid: string): Promise<string> {
        const node = await this.getNode(nodeUid);
        if (isProtonDocument(node.mediaType) || isProtonSheet(node.mediaType)) {
            const { volumeId, nodeId } = splitNodeUid(nodeUid);
            const type = isProtonDocument(node.mediaType) ? 'doc' : 'sheet';
            return `https://docs.proton.me/doc?type=${type}&mode=open&volumeId=${volumeId}&linkId=${nodeId}`;
        }

        const rootNode = await this.getRootNode(nodeUid);
        if (!rootNode.shareId) {
            throw new ProtonDriveError(c('Error').t`Node is not accessible`);
        }
        const { nodeId } = splitNodeUid(nodeUid);
        const type = node.type === NodeType.File ? 'file' : 'folder';

        return `https://drive.proton.me/${rootNode.shareId}/${type}/${nodeId}`;
    }

    private async getRootNode(nodeUid: string): Promise<DecryptedNode> {
        const node = await this.getNode(nodeUid);
        return node.parentUid ? this.getRootNode(node.parentUid) : node;
    }
}

export async function parseNode(logger: Logger, unparsedNode: DecryptedUnparsedNode): Promise<DecryptedNode> {
    let nodeName: Result<string, Error | InvalidNameError> = unparsedNode.name;
    if (unparsedNode.name.ok) {
        try {
            validateNodeName(unparsedNode.name.value);
        } catch (error: unknown) {
            logger.warn(`Node name validation failed: ${error instanceof Error ? error.message : error}`);
            nodeName = resultError({
                name: unparsedNode.name.value,
                error: error instanceof Error ? error.message : c('Error').t`Unknown error`,
            });
        }
    }

    const treeEventScopeId = splitNodeUid(unparsedNode.uid).volumeId;

    if (unparsedNode.type === NodeType.File) {
        const extendedAttributes = unparsedNode.activeRevision?.ok
            ? parseFileExtendedAttributes(
                  logger,
                  unparsedNode.activeRevision.value.creationTime,
                  unparsedNode.activeRevision.value.extendedAttributes,
              )
            : undefined;

        return {
            ...unparsedNode,
            isStale: false,
            activeRevision: !unparsedNode.activeRevision?.ok
                ? unparsedNode.activeRevision
                : resultOk({
                      uid: unparsedNode.activeRevision.value.uid,
                      state: unparsedNode.activeRevision.value.state,
                      creationTime: unparsedNode.activeRevision.value.creationTime,
                      storageSize: unparsedNode.activeRevision.value.storageSize,
                      contentAuthor: unparsedNode.activeRevision.value.contentAuthor,
                      thumbnails: unparsedNode.activeRevision.value.thumbnails,
                      ...extendedAttributes,
                  }),
            folder: undefined,
            treeEventScopeId,
        };
    }

    const extendedAttributes = unparsedNode.folder?.extendedAttributes
        ? parseFolderExtendedAttributes(logger, unparsedNode.folder.extendedAttributes)
        : undefined;
    return {
        ...unparsedNode,
        name: nodeName,
        isStale: false,
        activeRevision: undefined,
        folder: extendedAttributes,
        treeEventScopeId,
    };
}
