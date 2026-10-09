import { BoltFFICancelledError } from '@boltffi/runtime';
import { c } from 'ttag';

import { AbortError, ValidationError } from '../../errors';
import { makeNodeUid, splitNodeUid } from '../../internal/uids';
import type { SearchSdkCapabilities } from '../sdkCapabilities';
import {
    type DateRange,
    type ProtonDriveSearchClient,
    type RunIndexingOptions,
    type RunSchedule,
    type SearchDebugInfo,
    SearchIndex,
    type SearchQuery,
    type SearchResult,
    type SearchStatus,
} from '../types';
import {
    type DateRange as ModuleDateRange,
    type DriveSearchEngine,
    type FoundItem,
    type Node,
    type NodeUid,
    SearchEngineErrorException,
    SearchIndex as ModuleSearchIndex,
    type SearchQuery as ModuleSearchQuery,
    type Storage,
} from '../vendor/proton_drive_sdk_search.js';
import {
    DriveExtractEngineLoader,
    DriveSearchEngineLoader,
    SearchWasmLoader,
    type SearchWasmSource,
} from './driveEngineLoaders';
import { toNode } from './driveSearchEngineNode';
import { SdkHttpClient } from './sdkHttpClient';
import { SearchDriveSdkClient } from './searchDriveSdkClient';

const MODULE_INDEXES: Record<SearchIndex, ModuleSearchIndex> = {
    [SearchIndex.RecentNodes]: ModuleSearchIndex.Recent,
};

/**
 * TODO: the drive search module gives no hint yet of when the backend has
 * more; until it does, a drained run suggests coming back in a few minutes.
 */
const DRAINED_RUN_NEXT_CALL_AFTER_MS = 5 * 60 * 1000;

export interface SearchClientOptions {
    /**
     * Loads the search wasm. Called once, on the first search call, so a
     * runtime that never searches never loads it.
     */
    loadWasm: () => Promise<SearchWasmSource>;
    storage: Storage;
    /**
     * The SDK client's nodes and Drive API. A getter when they change between
     * runs, e.g. a worker serving several tabs.
     */
    sdk: SearchSdkCapabilities | (() => SearchSdkCapabilities);
}

/**
 * The search facade over the drive search engine, shared by every runtime: the
 * runtime only decides where it lives (worker, current thread) and supplies
 * the wasm and the backends.
 */
export class SearchClient implements ProtonDriveSearchClient {
    private driveSearchEngineLoader: DriveSearchEngineLoader;

    private driveExtractEngineLoader: DriveExtractEngineLoader;

    constructor({ loadWasm, storage, sdk }: SearchClientOptions) {
        const getSdk = typeof sdk === 'function' ? sdk : () => sdk;
        const http = new SdkHttpClient(getSdk);
        const wasm = new SearchWasmLoader(loadWasm);
        this.driveSearchEngineLoader = new DriveSearchEngineLoader(wasm, storage, http);
        this.driveExtractEngineLoader = new DriveExtractEngineLoader(
            wasm,
            new SearchDriveSdkClient((nodeUids) => loadNodes(getSdk(), nodeUids)),
            http,
        );
    }

    async runIndexing(
        _indexes: SearchIndex[],
        options?: RunIndexingOptions,
        signal?: AbortSignal,
    ): Promise<RunSchedule> {
        const driveSearchModule = await this.driveSearchEngineLoader.getDriveSearchEngine();
        await driveSearchModule.setEnabled(true);
        try {
            if (options?.storageQuota !== undefined) {
                await driveSearchModule.setIndexSizeLimit(BigInt(options.storageQuota), { signal });
            }
            // One backend batch per call; a list stays Active until a read finds
            // it empty and the backend reports every node indexed. While nodes
            // still wait for extraction, a list reads empty yet stays Active:
            // the run then ends once a batch indexes nothing.
            // TODO: bound the run (batches or time) so a backend that keeps
            // handing out work can't keep it going forever.
            let statuses = await this.getIndexStatuses(driveSearchModule);
            let indexedSomething;
            do {
                const before = statuses;
                await driveSearchModule.indexFromQueue({ signal });
                if (signal?.aborted) {
                    throw new AbortError();
                }
                statuses = await this.getIndexStatuses(driveSearchModule);
                indexedSomething = statuses.some(
                    ({ debugInfo }, position) =>
                        debugInfo.count !== before[position]!.debugInfo.count ||
                        debugInfo.size !== before[position]!.debugInfo.size,
                );
            } while (indexedSomething && statuses.some(({ debugInfo }) => debugInfo.status.tag === 'Active'));
            return { recommendedNextCallAfterMs: DRAINED_RUN_NEXT_CALL_AFTER_MS };
        } catch (error: unknown) {
            throw convertModuleError(error);
        }
    }

    async runExtraction(signal?: AbortSignal): Promise<RunSchedule> {
        const driveExtractModule = await this.driveExtractEngineLoader.getDriveExtractEngine();
        driveExtractModule.setSearchEnabled(true);
        try {
            // One queue batch per call. The queue sets when it may be asked
            // again: until then, a call would be throttled, so the run ends.
            let requestAgainAfter;
            do {
                if (signal?.aborted) {
                    throw new AbortError();
                }
                requestAgainAfter = Number(await driveExtractModule.extractFromQueue({ signal }));
            } while (!driveExtractModule.debugInfo().queueEmpty && requestAgainAfter <= nowInSeconds());
            return { recommendedNextCallAfterMs: Math.max(0, requestAgainAfter - nowInSeconds()) * 1000 };
        } catch (error: unknown) {
            throw convertModuleError(error);
        }
    }

    async *query(index: SearchIndex, query: SearchQuery, signal?: AbortSignal): AsyncGenerator<SearchResult> {
        const driveSearchModule = await this.driveSearchEngineLoader.getDriveSearchEngine();
        yield* streamHits((sink) =>
            driveSearchModule
                .search(MODULE_INDEXES[index], toModuleQuery(query), sink, { signal })
                .catch((error: unknown) => {
                    throw convertModuleError(error);
                }),
        );
    }

    async nodesDeleted(nodeUids: string[]): Promise<void> {
        const driveSearchModule = await this.driveSearchEngineLoader.getDriveSearchEngine();
        await driveSearchModule.delete(nodeUids.map(splitNodeUid));
    }

    /**
     * TODO: implement once the drive search module exposes the `status()` the
     * getStatus reference documents. Its only state reader today is
     * `debugInfo()`, which is meant for diagnostics: not stable, not
     * guaranteed fast, so status must not be derived from it. That `status()`
     * should also report what the module alone knows: whether indexing was
     * ever started (a never-read index reports Active, like one mid-way) and
     * whether the storage quota was reached (an index turns Capped only on the
     * run after), plus the extraction queue state once the extract engine is
     * wired.
     */
    async getStatus(): Promise<SearchStatus> {
        throw new Error('getStatus is not implemented yet');
    }

    async getDebugInfo(): Promise<SearchDebugInfo> {
        const driveSearchModule = await this.driveSearchEngineLoader.getDriveSearchEngine();
        const statuses = await this.getIndexStatuses(driveSearchModule);
        return {
            indexes: statuses.map(({ debugInfo }) => ({
                indexName: debugInfo.name,
                indexSizeBytes: Number(debugInfo.size),
                indexedNodesCount: Number(debugInfo.count),
            })),
            // TODO: report nodes being extracted once the extract engine is wired.
            extractingNodesCount: 0,
        };
    }

    private async getIndexStatuses(driveSearchModule: DriveSearchEngine) {
        return Promise.all(
            Object.values(SearchIndex).map(async (index) => ({
                index,
                debugInfo: await driveSearchModule.debugInfo(MODULE_INDEXES[index]),
            })),
        );
    }
}

/**
 * Turns the drive search module's pushed hits into a stream. Hits are queued
 * until the consumer pulls them.
 *
 * TODO: add backpressure and cancellation. `sendHit` returns right away, so
 * the queue grows as fast as the module pushes. A consumer that stops early
 * (`break`, `return()`) leaves the search running in the background. Make
 * `sendHit` wait until the consumer pulls the hit, and abort the search from
 * a `finally` in the generator.
 *
 * The drive search module runs a query in stages (e.g. exact, then fuzzy) and pushes a node
 * once per stage it matches. Only the first, from the best-scoring stage, is
 * kept. TODO: drop once the drive search module deduplicates hits itself.
 */
async function* streamHits(
    run: (sink: { sendHit: (item: FoundItem) => Promise<void> }) => Promise<unknown>,
): AsyncGenerator<SearchResult> {
    const queue: SearchResult[] = [];
    const seen = new Set<string>();
    let finished = false;
    let failure: unknown;
    let wake: (() => void) | undefined;

    void run({
        sendHit: async ({ nodeUid, score }) => {
            const uid = makeNodeUid(nodeUid.volumeId, nodeUid.nodeId);
            if (seen.has(uid)) {
                return;
            }
            seen.add(uid);
            queue.push({ nodeUid: uid, score });
            wake?.();
        },
    }).then(
        () => {
            finished = true;
            wake?.();
        },
        (error: unknown) => {
            failure = error;
            finished = true;
            wake?.();
        },
    );

    while (true) {
        const hit = queue.shift();
        if (hit) {
            yield hit;
            continue;
        }
        if (finished) {
            if (failure) {
                throw failure;
            }
            return;
        }
        await new Promise<void>((resolve) => {
            wake = resolve;
        });
        wake = undefined;
    }
}

function toModuleQuery(query: SearchQuery): ModuleSearchQuery {
    if (typeof query === 'string') {
        return { tag: 'Text', value0: query };
    }
    return {
        tag: 'Structured',
        value0: {
            name: query.name,
            parentUid: query.parentUid ? splitNodeUid(query.parentUid) : null,
            mediaType: query.mediaType ?? null,
            createdBy: query.createdBy ?? null,
            ownedBy: query.ownedBy ?? null,
            creationTime: toModuleDateRange(query.creationTime),
            modificationTime: toModuleDateRange(query.modificationTime),
            lastAccessTime: toModuleDateRange(query.lastAccessTime),
            size: query.size ? { from: toBigInt(query.size.from), to: toBigInt(query.size.to) } : null,
        },
    };
}

/** The drive search module takes Unix seconds. */
function toModuleDateRange(range?: DateRange): ModuleDateRange | null {
    if (!range) {
        return null;
    }
    const toSeconds = (date?: Date) => (date ? BigInt(Math.floor(date.getTime() / 1000)) : null);
    return { from: toSeconds(range.from), to: toSeconds(range.to) };
}

async function* loadNodes(sdk: SearchSdkCapabilities, nodeUids: NodeUid[]): AsyncGenerator<Node> {
    const nodes = await sdk.loadNodes(nodeUids.map(({ volumeId, nodeId }) => makeNodeUid(volumeId, nodeId)));
    for (const node of nodes) {
        yield toNode(node);
    }
}

function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function toBigInt(value?: number): bigint | null {
    return value === undefined ? null : BigInt(value);
}

function isIndexSizeLimit(error: unknown): boolean {
    return error instanceof SearchEngineErrorException && error.value.tag === 'IndexSizeLimit';
}

function convertModuleError(error: unknown): unknown {
    if (error instanceof BoltFFICancelledError) {
        return new AbortError();
    }
    if (isIndexSizeLimit(error)) {
        return new ValidationError(c('Error').t`Search index reached its storage quota`);
    }
    return error;
}
