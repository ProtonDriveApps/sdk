import * as Comlink from 'comlink';

import type { SearchSdkCapabilities } from '../sdkCapabilities';
import type {
    ProtonDriveSearchClient,
    RunIndexingOptions,
    RunSchedule,
    SearchDebugInfo,
    SearchIndex,
    SearchQuery,
    SearchResult,
    SearchStatus,
} from '../types';

/**
 * The search facade as the SharedWorker exposes it over Comlink, which can
 * post neither an async generator nor an `AbortSignal`.
 *
 * TODO: stream query results and relay abort signals across the port, e.g.
 * with Comlink transfer handlers that swap each for a `MessagePort`. Then
 * the worker can expose the `ProtonDriveSearchClient` as is, and this
 * interface and both adapters go away.
 */
export interface SearchWorkerApi {
    // Runs reach the Drive API: `sdk` is the calling tab's, proxied (see {@link SearchSdkRelay}).
    runIndexing(sdk: SearchSdkCapabilities, indexes: SearchIndex[], options?: RunIndexingOptions): Promise<RunSchedule>;
    runExtraction(sdk: SearchSdkCapabilities): Promise<RunSchedule>;
    query(index: SearchIndex, query: SearchQuery): Promise<SearchResult[]>;
    nodesDeleted: ProtonDriveSearchClient['nodesDeleted'];
    getStatus: ProtonDriveSearchClient['getStatus'];
    getDebugInfo: ProtonDriveSearchClient['getDebugInfo'];
}

/**
 * Worker side: hands the search module the SDK of the tab whose run is in
 * progress.
 *
 * A SharedWorker serves several tabs, and a closed tab's proxy never answers,
 * so each run brings its tab's SDK instead of the worker keeping one. Runs
 * go one at a time, so the module never sees another tab's SDK mid-run.
 *
 * NOTE: we might move from a SharedWorker to a dedicated Worker per tab. That
 * worker would get its tab's SDK once, at start, and keep it for its whole
 * life: this relay, and the SDK argument of each run, would go away.
 */
export class SearchSdkRelay {
    private current?: SearchSdkCapabilities;

    private runs: Promise<unknown> = Promise.resolve();

    get(): SearchSdkCapabilities {
        if (!this.current) {
            throw new Error('The SDK client is only available during a run');
        }
        return this.current;
    }

    run<T>(sdk: SearchSdkCapabilities, task: () => Promise<T>): Promise<T> {
        const result = this.runs.then(async () => {
            this.current = sdk;
            try {
                return await task();
            } finally {
                this.current = undefined;
            }
        });
        this.runs = result.catch(() => undefined);
        return result;
    }
}

/**
 * Worker side: the search client in a form Comlink can expose.
 */
export class SearchWorkerApiAdapter implements SearchWorkerApi {
    constructor(
        private searchClient: ProtonDriveSearchClient,
        private sdkRelay: SearchSdkRelay,
    ) {
        this.searchClient = searchClient;
        this.sdkRelay = sdkRelay;
    }

    async runIndexing(
        sdk: SearchSdkCapabilities,
        indexes: SearchIndex[],
        options?: RunIndexingOptions,
    ): Promise<RunSchedule> {
        return this.runWith(sdk, () => this.searchClient.runIndexing(indexes, options));
    }

    async runExtraction(sdk: SearchSdkCapabilities): Promise<RunSchedule> {
        return this.runWith(sdk, () => this.searchClient.runExtraction());
    }

    private async runWith<T>(sdk: SearchSdkCapabilities, task: () => Promise<T>): Promise<T> {
        try {
            return await this.sdkRelay.run(sdk, task);
        } finally {
            (sdk as Partial<Comlink.Remote<SearchSdkCapabilities>>)[Comlink.releaseProxy]?.();
        }
    }

    async query(index: SearchIndex, query: SearchQuery): Promise<SearchResult[]> {
        const results = [];
        for await (const result of this.searchClient.query(index, query)) {
            results.push(result);
        }
        return results;
    }

    async nodesDeleted(nodeUids: string[]): Promise<void> {
        return this.searchClient.nodesDeleted(nodeUids);
    }

    async getStatus(): Promise<SearchStatus> {
        return this.searchClient.getStatus();
    }

    async getDebugInfo(): Promise<SearchDebugInfo> {
        return this.searchClient.getDebugInfo();
    }
}

/**
 * Main-thread side: the search client back from the worker's Comlink proxy.
 */
export class RemoteSearchClient implements ProtonDriveSearchClient {
    constructor(
        private remote: Comlink.Remote<SearchWorkerApi>,
        private sdk: SearchSdkCapabilities,
    ) {
        this.remote = remote;
        this.sdk = sdk;
    }

    async runIndexing(indexes: SearchIndex[], options?: RunIndexingOptions): Promise<RunSchedule> {
        // TODO: relay `signal`: an AbortSignal can't be posted to the worker.
        return this.remote.runIndexing(Comlink.proxy(this.sdk), indexes, options);
    }

    async runExtraction(): Promise<RunSchedule> {
        // TODO: relay `signal`, as for `runIndexing`.
        return this.remote.runExtraction(Comlink.proxy(this.sdk));
    }

    async *query(index: SearchIndex, query: SearchQuery): AsyncGenerator<SearchResult> {
        yield* await this.remote.query(index, query);
    }

    async nodesDeleted(nodeUids: string[]): Promise<void> {
        return this.remote.nodesDeleted(nodeUids);
    }

    async getStatus(): Promise<SearchStatus> {
        return this.remote.getStatus();
    }

    async getDebugInfo(): Promise<SearchDebugInfo> {
        return this.remote.getDebugInfo();
    }
}
