import type { SearchSdkCapabilities } from './sdkCapabilities';

/**
 * Logical set of nodes a device indexes and searches.
 *
 * Not 1:1 with the indexes in storage: the module may split one logical index
 * into several (e.g. shards, or per volume) without the application caring.
 *
 * TODO: add `MyFiles`, `SharedWithMe` and `Devices` once the drive search
 * module keeps those nodes again.
 */
export enum SearchIndex {
    /** Nodes selected according to recent access. */
    RecentNodes = 'RecentNodes',
}

export type SearchQuery = string | StructuredSearchQuery;

/**
 * Text matched against node names, narrowed by filters.
 */
export interface StructuredSearchQuery {
    name: string;
    parentUid?: string;
    /** Wildcards allowed, e.g. `image/*`. */
    mediaType?: string;
    createdBy?: string;
    ownedBy?: string;
    creationTime?: DateRange;
    modificationTime?: DateRange;
    lastAccessTime?: DateRange;
    /** In bytes. */
    size?: { from?: number; to?: number };
}

export interface DateRange {
    from?: Date;
    to?: Date;
}

export interface SearchResult {
    nodeUid: string;
    /** Meaningful only within the same query. */
    score: number;
}

export interface RunIndexingOptions {
    /** Maximum local storage the indexes may use, in bytes. Defaults to 25 MB. */
    storageQuota?: number;
}

export interface RunSchedule {
    /**
     * Recommended delay before calling the same method again. 0 means as
     * soon as practical.
     */
    recommendedNextCallAfterMs: number;
}

export enum IndexStatus {
    /** Indexing has not been activated yet. */
    NoIndex = 'NoIndex',
    IndexingInProgress = 'IndexingInProgress',
    IndexingCompleted = 'IndexingCompleted',
    IndexingFailed = 'IndexingFailed',
    /** The index is available, but some nodes failed to be indexed. */
    IndexIncompleteDueToFailure = 'IndexIncompleteDueToFailure',
    /** The index reached its storage quota. */
    IndexIncompleteDueToSpaceLimit = 'IndexIncompleteDueToSpaceLimit',
    /** Some extracts are incompatible and an upgrade is required. */
    IndexIncompleteDueToIncompatibleExtracts = 'IndexIncompleteDueToIncompatibleExtracts',
}

export interface SearchStatus {
    /** `true` when all known nodes have extracted data. */
    isDataExtractionQueueEmpty: boolean;
    /** `true` when nodes that should be indexed are still missing extracted data. */
    isDataExtractionForLocalIndexesNeeded: boolean;
    indexesStatuses: { index: SearchIndex; status: IndexStatus }[];
}

export interface SearchDebugInfo {
    /** Internal indexes: names are diagnostic and not 1:1 with {@link SearchIndex}. */
    indexes: { indexName: string; indexSizeBytes: number; indexedNodesCount: number }[];
    extractingNodesCount: number;
}

/**
 * The search module's public facade. See the search documentation for the
 * scheduling model of `runIndexing`.
 *
 * NOTE: Experimental: the API will change as the drive search module grows.
 */
export interface ProtonDriveSearchClient {
    /**
     * Builds and updates the logical indexes until no indexing work remains.
     *
     * TODO: only the listed `indexes` should be kept and the others removed;
     * the drive search module maintains every index for now.
     * TODO: `removeOldestNodesWhenQuotaIsReached`; the drive search module only rotates the
     * recent index for now.
     *
     * @throws {@link ValidationError} When the storage quota is reached.
     * @throws {@link AbortError} When `signal` aborts; progress so far is kept.
     */
    runIndexing(indexes: SearchIndex[], options?: RunIndexingOptions, signal?: AbortSignal): Promise<RunSchedule>;

    /**
     * Extracts the nodes the backend's extraction queue hands out, and uploads
     * the extracts for every device to index, until the queue is empty or
     * throttles this client.
     *
     * @throws {@link AbortError} When `signal` aborts; extracts uploaded so far are kept.
     */
    runExtraction(signal?: AbortSignal): Promise<RunSchedule>;

    /** Streams matches from `index` as they are found. */
    query(index: SearchIndex, query: SearchQuery, signal?: AbortSignal): AsyncGenerator<SearchResult>;

    /**
     * Removes deleted nodes from every local index.
     *
     * TODO: `eventScopeIds`, to remove every node of a scope.
     */
    nodesDeleted(nodeUids: string[]): Promise<void>;

    getStatus(): Promise<SearchStatus>;

    getDebugInfo(): Promise<SearchDebugInfo>;
}

/**
 * Provides a Search service implementation.
 *
 * Each implementation can be tailored to its runtime environment e.g.:
 *  - For the web browser version, it could be using web APIs like SharedWorker.
 *  - For the CLI node version, it should only use node APIs (e.g. Worker instead of WebWorker).
 */
export interface SearchServiceProvider {
    /**
     * @param sdk - What the search module needs from the SDK client.
     */
    start(sdkVersion: string, addressId: string, sdk: SearchSdkCapabilities): Promise<ProtonDriveSearchClient>;
}
