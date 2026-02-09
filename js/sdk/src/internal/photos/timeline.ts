import { DriveCrypto } from '../../crypto';
import { Logger } from '../../interface';
import { makeNodeUid } from '../uids';
import { PhotosAPIService } from './apiService';
import { TimelineItem } from './interface';
import { PhotosNodesAccess } from './nodes';
import { PhotoSharesManager } from './shares';

/**
 * Provides access to the photo timeline.
 */
export class PhotosTimeline {
    constructor(
        private logger: Logger,
        private apiService: PhotosAPIService,
        private driveCrypto: DriveCrypto,
        private photoShares: PhotoSharesManager,
        private nodesService: PhotosNodesAccess,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.driveCrypto = driveCrypto;
        this.photoShares = photoShares;
        this.nodesService = nodesService;
    }

    async *iterateTimeline(signal?: AbortSignal): AsyncGenerator<TimelineItem> {
        const { volumeId } = await this.photoShares.getRootIDs();
        yield* this.apiService.iterateTimeline(volumeId, signal);
    }

    async findPhotoDuplicates(name: string, generateSha1: () => Promise<string>, signal?: AbortSignal): Promise<string[]> {
        const { volumeId, rootNodeId } = await this.photoShares.getRootIDs();
        const rootNodeUid = makeNodeUid(volumeId, rootNodeId);
        const { hashKey } = await this.nodesService.getNodeKeys(rootNodeUid);
        if (!hashKey) {
            throw new Error('Hash key of photo root node not found');
        }

        const nameHash = await this.driveCrypto.generateLookupHash(name, hashKey);
        const duplicates = await this.apiService.checkPhotoDuplicates(volumeId, [nameHash], signal);

        if (duplicates.length === 0) {
            return [];
        }

        // Generate the SHA1 only when there is any matching node hash to avoid
        // computing it for every node as in most cases there is no match.
        const sha1 = await generateSha1();
        const contentHash = await this.driveCrypto.generateLookupHash(sha1, hashKey);

        const matchingDuplicates = duplicates.filter(
            (duplicate) => duplicate.nameHash === nameHash && duplicate.contentHash === contentHash,
        );

        if (matchingDuplicates.length === 0) {
            return [];
        }

        const nodeUids = matchingDuplicates.map((duplicate) => duplicate.nodeUid);
        this.logger.debug(
            `Duplicate photo found: name hash: ${nameHash}, content hash: ${contentHash}, node uids: ${nodeUids}`,
        );
        return nodeUids;
    }
}
