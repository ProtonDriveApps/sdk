import { c } from 'ttag';

import { MaybeBookmark, ProtonInvitationWithNode, resultError, resultOk } from '../../interface';
import { ValidationError } from '../../errors';
import { DecryptedNode } from '../nodes';
import { BatchLoading } from '../batchLoading';
import { SharingAPIService } from './apiService';
import { SharingCache } from './cache';
import { SharingCryptoService } from './cryptoService';
import { SharesService, NodesService } from './interface';

// This is the number of nodes that are loaded in parallel.
// It is a trade-off between initial wait time and overhead of API calls.
export const BATCH_LOADING_SIZE = 30;

/**
 * Provides high-level actions for access shared nodes.
 *
 * The manager is responsible for listing shared by me, shared with me,
 * invitations, bookmarks, etc., including API communication, encryption,
 * decryption, and caching.
 */
export class SharingAccess {
    constructor(
        private apiService: SharingAPIService,
        private cache: SharingCache,
        private cryptoService: SharingCryptoService,
        private sharesService: SharesService,
        private nodesService: NodesService,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoService = cryptoService;
        this.sharesService = sharesService;
        this.nodesService = nodesService;
    }

    async *iterateSharedNodes(signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        try {
            const nodeUids = await this.cache.getSharedByMeNodeUids();
            yield* this.iterateSharedNodesFromCache(nodeUids, signal);
        } catch {
            const { volumeId } = await this.sharesService.getOwnVolumeIDs();
            const nodeUidsIterator = this.apiService.iterateSharedNodeUids(volumeId, signal);
            yield* this.iterateSharedNodesFromAPI(
                nodeUidsIterator,
                (nodeUids) => this.cache.setSharedByMeNodeUids(nodeUids),
                signal,
            );
        }
    }

    async *iterateSharedNodesWithMe(signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        try {
            const nodeUids = await this.cache.getSharedWithMeNodeUids();
            yield* this.iterateSharedNodesFromCache(nodeUids, signal);
        } catch {
            const nodeUidsIterator = this.apiService.iterateSharedWithMeNodeUids(signal);
            yield* this.iterateSharedNodesFromAPI(
                nodeUidsIterator,
                (nodeUids) => this.cache.setSharedWithMeNodeUids(nodeUids),
                signal,
            );
        }
    }

    private async *iterateSharedNodesFromCache(
        nodeUids: string[],
        signal?: AbortSignal,
    ): AsyncGenerator<DecryptedNode> {
        const batchLoading = new BatchLoading<string, DecryptedNode>({
            iterateItems: (nodeUids) => this.iterateNodesAndIgnoreMissingOnes(nodeUids, signal),
            batchSize: BATCH_LOADING_SIZE,
        });
        for (const nodeUid of nodeUids) {
            yield* batchLoading.load(nodeUid);
        }
        yield* batchLoading.loadRest();
    }

    private async *iterateSharedNodesFromAPI(
        nodeUidsIterator: AsyncGenerator<string>,
        setCache: (nodeUids: string[]) => Promise<void>,
        signal?: AbortSignal,
    ): AsyncGenerator<DecryptedNode> {
        const loadedNodeUids = [];
        const batchLoading = new BatchLoading<string, DecryptedNode>({
            iterateItems: (nodeUids) => this.iterateNodesAndIgnoreMissingOnes(nodeUids, signal),
            batchSize: BATCH_LOADING_SIZE,
        });
        for await (const nodeUid of nodeUidsIterator) {
            loadedNodeUids.push(nodeUid);
            yield* batchLoading.load(nodeUid);
        }
        yield* batchLoading.loadRest();
        // Set cache only at the end. Once there is anything in the cache,
        // it will be used instead of requesting the data from the API.
        await setCache(loadedNodeUids);
    }

    private async *iterateNodesAndIgnoreMissingOnes(
        nodeUids: string[],
        signal?: AbortSignal,
    ): AsyncGenerator<DecryptedNode> {
        const nodeGenerator = this.nodesService.iterateNodes(nodeUids, signal);
        for await (const node of nodeGenerator) {
            if ('missingUid' in node) {
                continue;
            }
            yield node;
        }
    }

    async removeSharedNodeWithMe(nodeUid: string): Promise<void> {
        const node = await this.nodesService.getNode(nodeUid);
        if (!node.shareId) {
            return;
        }

        const share = await this.sharesService.loadEncryptedShare(node.shareId);
        const memberUid = share.membership?.memberUid;
        if (!memberUid) {
            throw new ValidationError(c('Error').t`You can leave only item that is shared with you`);
        }

        await this.apiService.removeMember(memberUid);
        if (await this.cache.hasSharedWithMeNodeUidsLoaded()) {
            await this.cache.removeSharedWithMeNodeUid(nodeUid);
        }
    }

    async *iterateInvitations(signal?: AbortSignal): AsyncGenerator<ProtonInvitationWithNode> {
        for await (const invitationUid of this.apiService.iterateInvitationUids(signal)) {
            const encryptedInvitation = await this.apiService.getInvitation(invitationUid);
            const invitation = await this.cryptoService.decryptInvitationWithNode(encryptedInvitation);
            yield invitation;
        }
    }

    async acceptInvitation(invitationUid: string): Promise<void> {
        const encryptedInvitation = await this.apiService.getInvitation(invitationUid);
        const { base64SessionKeySignature } = await this.cryptoService.acceptInvitation(encryptedInvitation);
        await this.apiService.acceptInvitation(invitationUid, base64SessionKeySignature);
        if (await this.cache.hasSharedWithMeNodeUidsLoaded()) {
            await this.cache.addSharedWithMeNodeUid(encryptedInvitation.node.uid);
        }
    }

    async rejectInvitation(invitationUid: string): Promise<void> {
        await this.apiService.rejectInvitation(invitationUid);
    }

    async *iterateBookmarks(signal?: AbortSignal): AsyncGenerator<MaybeBookmark> {
        for await (const bookmark of this.apiService.iterateBookmarks(signal)) {
            const { url, customPassword, nodeName } = await this.cryptoService.decryptBookmark(bookmark);

            if (!url.ok || !customPassword.ok || !nodeName.ok) {
                yield resultError({
                    uid: bookmark.tokenId,
                    creationTime: bookmark.creationTime,
                    url: url,
                    customPassword,
                    node: {
                        name: nodeName,
                        type: bookmark.node.type,
                        mediaType: bookmark.node.mediaType,
                    },
                });
            } else {
                yield resultOk({
                    uid: bookmark.tokenId,
                    creationTime: bookmark.creationTime,
                    url: url.value,
                    customPassword: customPassword.value,
                    node: {
                        name: nodeName.value,
                        type: bookmark.node.type,
                        mediaType: bookmark.node.mediaType,
                    },
                });
            }
        }
    }

    async deleteBookmark(bookmarkUid: string): Promise<void> {
        const tokenId = bookmarkUid;
        await this.apiService.deleteBookmark(tokenId);
    }
}
