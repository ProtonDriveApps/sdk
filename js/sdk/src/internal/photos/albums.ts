import { BatchLoading } from '../batchLoading';
import { DecryptedNode } from '../nodes';
import { PhotosAPIService } from './apiService';
import { NodesService } from './interface';
import { PhotoSharesManager } from './shares';

const BATCH_LOADING_SIZE = 10;

/**
 * Provides access and high-level actions for managing albums.
 */
export class Albums {
    constructor(
        private apiService: PhotosAPIService,
        private photoShares: PhotoSharesManager,
        private nodesService: NodesService,
    ) {
        this.apiService = apiService;
        this.photoShares = photoShares;
        this.nodesService = nodesService;
    }

    async *iterateAlbums(signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const { volumeId } = await this.photoShares.getOwnVolumeIDs();

        const batchLoading = new BatchLoading<string, DecryptedNode>({
            iterateItems: (nodeUids) => this.iterateNodesAndIgnoreMissingOnes(nodeUids, signal),
            batchSize: BATCH_LOADING_SIZE,
        });
        for await (const album of this.apiService.iterateAlbums(volumeId, signal)) {
            yield* batchLoading.load(album.albumUid);
        }
        yield* batchLoading.loadRest();
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
}
