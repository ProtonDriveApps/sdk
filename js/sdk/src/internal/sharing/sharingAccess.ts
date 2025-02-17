import { NodeEntity } from "../../interface";
import { BatchLoading } from "../batchLoading";
import { SharingAPIService } from "./apiService";
import { SharingCache } from "./cache";
import { SharesService, NodesService } from "./interface";

export class SharingAccess {
    constructor(
        private apiService: SharingAPIService,
        private cache: SharingCache,
        private sharesService: SharesService,
        private nodesService: NodesService,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.sharesService = sharesService;
        this.nodesService = nodesService;
    }

    async* iterateSharedNodes(signal?: AbortSignal): AsyncGenerator<NodeEntity> {
        try {
            const nodeUids = await this.cache.getSharedByMeNodeUids();
            yield* this.iterateSharedNodesFromCache(nodeUids, signal);
        } catch {
            const { volumeId } = await this.sharesService.getMyFilesIDs();
            const nodeUidsIterator = this.apiService.iterateSharedNodeUids(volumeId, signal);
            yield* this.iterateSharedNodesFromAPI(nodeUidsIterator, (nodeUids) => this.cache.setSharedByMeNodeUids(nodeUids), signal);
        }
    }

    async* iterateSharedNodesWithMe(signal?: AbortSignal): AsyncGenerator<NodeEntity> {
        try {
            const nodeUids = await this.cache.getSharedWithMeNodeUids();
            yield* this.iterateSharedNodesFromCache(nodeUids, signal);
        } catch {
            const nodeUidsIterator = this.apiService.iterateSharedWithMeNodeUids(signal);
            yield* this.iterateSharedNodesFromAPI(nodeUidsIterator, (nodeUids) => this.cache.setSharedWithMeNodeUids(nodeUids), signal);
        }
    }

    private async* iterateSharedNodesFromCache(nodeUids: string[], signal?: AbortSignal) {
        const batchLoading = new BatchLoading<string, NodeEntity>({ iterateItems: (nodeUids) => this.nodesService.iterateNodes(nodeUids, signal) });
        for (const nodeUid of nodeUids) {
            yield* batchLoading.load(nodeUid);
        }
        yield* batchLoading.loadRest();
    }

    private async* iterateSharedNodesFromAPI(
        nodeUidsIterator: AsyncGenerator<string>,
        setCache: (nodeUids: string[]) => Promise<void>,
        signal?: AbortSignal,
    ): AsyncGenerator<NodeEntity> {
        const loadedNodeUids = [];
        const batchLoading = new BatchLoading<string, NodeEntity>({ iterateItems: (nodeUids) => this.nodesService.iterateNodes(nodeUids, signal) });
        for await (const nodeUid of nodeUidsIterator) {
            loadedNodeUids.push(nodeUid);
            yield* batchLoading.load(nodeUid);
        }
        yield* batchLoading.loadRest();
        // Set cache only at the end. Once there is anything in the cache,
        // it will be used instead of requesting the data from the API.
        await setCache(loadedNodeUids);
    }

    // TODO: return decrypted invitations
    async* iterateInvitations(signal?: AbortSignal): AsyncGenerator<string> {
        for await (const invitationUid of this.apiService.iterateInvitationUids(signal)) {
            yield invitationUid;
        }
    }

    // TODO: return decrypted bookmarks
    async* iterateSharedBookmarks(signal?: AbortSignal): AsyncGenerator<string> {
        for await (const bookmark of this.apiService.iterateBookmarks(signal)) {
            yield bookmark.tokenId;
        }
    }
}
