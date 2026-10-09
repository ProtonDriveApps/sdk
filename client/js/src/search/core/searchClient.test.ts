import { BoltFFICancelledError } from '@boltffi/runtime';

import { AbortError, ValidationError } from '../../errors';
import { makeNodeUid } from '../../internal/uids';
import type { SearchSdkCapabilities } from '../sdkCapabilities';
import { SearchIndex } from '../types';
import {
    type DriveExtractEngine,
    type DriveSearchEngine,
    type FoundItem,
    SearchEngineErrorException,
    type Storage,
} from '../vendor/proton_drive_sdk_search.js';
import { DriveExtractEngineLoader, DriveSearchEngineLoader } from './driveEngineLoaders';
import { SearchClient } from './searchClient';

// The generated bindings are missing in CI's test job: only the values the
// client uses are provided, so the drive search module below never needs the wasm.
jest.mock(
    '../vendor/proton_drive_sdk_search.js',
    () => ({
        SearchIndex: { Recent: 0 },
        SearchEngineErrorException: class SearchEngineErrorException extends Error {
            constructor(readonly value: unknown) {
                super('SearchEngineError');
            }
        },
    }),
    { virtual: true },
);

// The client builds its own engine loaders: they hand out the fake engines below.
jest.mock('./driveEngineLoaders', () => ({
    SearchWasmLoader: jest.fn(),
    DriveSearchEngineLoader: jest.fn(),
    DriveExtractEngineLoader: jest.fn(),
}));

type StatusTag = 'Active' | 'Complete' | 'Capped' | 'Disabled' | 'Failed';

const MODULE_INDEXES = [0];

function createFakeDriveSearchModule() {
    const statuses: Record<number, StatusTag> = { 0: 'Active' };
    const counts: Record<number, bigint> = { 0: 0n };
    const driveSearchModule = {
        statuses,
        counts,
        setEnabled: jest.fn(async () => {}),
        setIndexSizeLimit: jest.fn(async () => {}),
        // Drains every index in one batch by default.
        indexFromQueue: jest.fn(async () => {
            MODULE_INDEXES.forEach((index) => (statuses[index] = 'Complete'));
        }),
        debugInfo: jest.fn(async (index: number) => ({
            name: `index-${index}`,
            size: BigInt(1000 * (index + 1)),
            count: counts[index],
            shards: 1n,
            status: { tag: statuses[index] },
        })),
        search: jest.fn(
            async (_index: number, _query: unknown, _sink: { sendHit: (item: FoundItem) => Promise<void> }) => 0,
        ),
        delete: jest.fn(async () => {}),
    };
    return driveSearchModule;
}

/** Seconds since the Unix epoch, frozen by `setup`. */
const NOW = 1_700_000_000;

function createFakeDriveExtractModule() {
    const queue = { empty: false };
    return {
        setSearchEnabled: jest.fn(),
        // Drains the queue in one batch by default; may be asked again right away.
        extractFromQueue: jest.fn(async (): Promise<bigint> => {
            queue.empty = true;
            return BigInt(NOW);
        }),
        debugInfo: jest.fn(() => ({
            queueEmpty: queue.empty,
            outOfDateExtractors: [],
            blockedExtractors: [],
            requestAgainAfter: BigInt(NOW),
        })),
    };
}

function setup() {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    const driveSearchModule = createFakeDriveSearchModule();
    const driveExtractModule = createFakeDriveExtractModule();
    const getDriveSearchEngine = jest.fn(async () => driveSearchModule as unknown as DriveSearchEngine);
    const getDriveExtractEngine = jest.fn(async () => driveExtractModule as unknown as DriveExtractEngine);
    jest.mocked(DriveSearchEngineLoader).mockImplementation(
        () => ({ getDriveSearchEngine }) as unknown as DriveSearchEngineLoader,
    );
    jest.mocked(DriveExtractEngineLoader).mockImplementation(
        () => ({ getDriveExtractEngine }) as unknown as DriveExtractEngineLoader,
    );
    const client = new SearchClient({
        loadWasm: jest.fn(),
        storage: {} as Storage,
        sdk: {} as SearchSdkCapabilities,
    });
    return { driveSearchModule, driveExtractModule, getDriveSearchEngine, client };
}

const hit = (nodeId: string, score = 1): FoundItem => ({ nodeUid: { volumeId: 'volume', nodeId }, score });

async function collect<T>(generator: AsyncGenerator<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of generator) {
        items.push(item);
    }
    return items;
}

describe('SearchClient', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('runIndexing', () => {
        it('enables the drive search module and indexes until no index is active', async () => {
            const { driveSearchModule, client } = setup();
            driveSearchModule.indexFromQueue
                .mockImplementationOnce(async () => {
                    driveSearchModule.counts[0] = 50n;
                })
                .mockImplementationOnce(async () => {
                    driveSearchModule.counts[0] = 60n;
                    driveSearchModule.statuses[0] = 'Complete';
                });

            const schedule = await client.runIndexing(Object.values(SearchIndex));

            expect(driveSearchModule.setEnabled).toHaveBeenCalledWith(true);
            expect(driveSearchModule.indexFromQueue).toHaveBeenCalledTimes(2);
            expect(driveSearchModule.setIndexSizeLimit).not.toHaveBeenCalled();
            expect(schedule).toEqual({ recommendedNextCallAfterMs: 5 * 60 * 1000 });
        });

        it('stops once a batch indexes nothing, though the index stays active', async () => {
            const { driveSearchModule, client } = setup();
            // Nodes still waiting for extraction keep the list active, yet it reads empty.
            driveSearchModule.indexFromQueue
                .mockImplementationOnce(async () => {
                    driveSearchModule.counts[0] = 50n;
                })
                .mockImplementation(async () => {});

            await client.runIndexing(Object.values(SearchIndex));

            expect(driveSearchModule.indexFromQueue).toHaveBeenCalledTimes(2);
        });

        it('sets the storage quota before indexing', async () => {
            const { driveSearchModule, client } = setup();

            await client.runIndexing(Object.values(SearchIndex), { storageQuota: 25_000_000 });

            expect(driveSearchModule.setIndexSizeLimit).toHaveBeenCalledWith(25_000_000n, { signal: undefined });
            expect(driveSearchModule.setIndexSizeLimit.mock.invocationCallOrder[0]).toBeLessThan(
                driveSearchModule.indexFromQueue.mock.invocationCallOrder[0],
            );
        });

        it('stops with an AbortError once the signal is aborted', async () => {
            const { driveSearchModule, client } = setup();
            const controller = new AbortController();
            driveSearchModule.indexFromQueue.mockImplementation(async () => controller.abort());

            await expect(client.runIndexing(Object.values(SearchIndex), {}, controller.signal)).rejects.toThrow(
                AbortError,
            );
            expect(driveSearchModule.indexFromQueue).toHaveBeenCalledTimes(1);
        });

        it('converts a drive search module cancellation to an AbortError', async () => {
            const { driveSearchModule, client } = setup();
            driveSearchModule.indexFromQueue.mockRejectedValue(new BoltFFICancelledError());

            await expect(client.runIndexing(Object.values(SearchIndex))).rejects.toThrow(AbortError);
        });

        it('converts a reached storage quota to a ValidationError', async () => {
            const { driveSearchModule, client } = setup();
            driveSearchModule.indexFromQueue.mockRejectedValue(
                new SearchEngineErrorException({ tag: 'IndexSizeLimit' }),
            );

            await expect(client.runIndexing(Object.values(SearchIndex))).rejects.toThrow(ValidationError);
        });

        it('passes other drive search module errors through', async () => {
            const { driveSearchModule, client } = setup();
            const error = new SearchEngineErrorException({ tag: 'Http', value0: 'request failed' });
            driveSearchModule.indexFromQueue.mockRejectedValue(error);

            await expect(client.runIndexing(Object.values(SearchIndex))).rejects.toBe(error);
        });
    });

    describe('runExtraction', () => {
        it('enables search and extracts until the queue is empty', async () => {
            const { driveExtractModule, client } = setup();
            driveExtractModule.extractFromQueue.mockResolvedValueOnce(BigInt(NOW));

            expect(await client.runExtraction()).toEqual({ recommendedNextCallAfterMs: 0 });
            expect(driveExtractModule.setSearchEnabled).toHaveBeenCalledWith(true);
            expect(driveExtractModule.extractFromQueue).toHaveBeenCalledTimes(2);
        });

        it('stops when the queue throttles, recommending to come back after it', async () => {
            const { driveExtractModule, client } = setup();
            driveExtractModule.extractFromQueue.mockResolvedValue(BigInt(NOW + 30));

            expect(await client.runExtraction()).toEqual({ recommendedNextCallAfterMs: 30_000 });
            expect(driveExtractModule.extractFromQueue).toHaveBeenCalledTimes(1);
        });

        it('stops with an AbortError once the signal is aborted', async () => {
            const { driveExtractModule, client } = setup();
            const controller = new AbortController();
            driveExtractModule.extractFromQueue.mockImplementation(async () => {
                controller.abort();
                return BigInt(NOW);
            });

            await expect(client.runExtraction(controller.signal)).rejects.toThrow(AbortError);
            expect(driveExtractModule.extractFromQueue).toHaveBeenCalledTimes(1);
        });

        it('converts a drive extract module cancellation to an AbortError', async () => {
            const { driveExtractModule, client } = setup();
            driveExtractModule.extractFromQueue.mockRejectedValue(new BoltFFICancelledError());

            await expect(client.runExtraction()).rejects.toThrow(AbortError);
        });
    });

    describe('query', () => {
        it('searches the matching drive search module index with a text query', async () => {
            const { driveSearchModule, client } = setup();

            await collect(client.query(SearchIndex.RecentNodes, 'invoice'));

            expect(driveSearchModule.search.mock.calls.map(([index, query]) => [index, query])).toEqual([
                [0, { tag: 'Text', value0: 'invoice' }],
            ]);
        });

        it('maps a structured query to the drive search module format', async () => {
            const { driveSearchModule, client } = setup();

            await collect(
                client.query(SearchIndex.RecentNodes, {
                    name: 'invoice',
                    parentUid: makeNodeUid('volume', 'parent'),
                    mediaType: 'application/pdf',
                    creationTime: { from: new Date('2024-01-01T00:00:00.999Z') },
                    modificationTime: { to: new Date('2024-02-01T00:00:00Z') },
                    size: { from: 100 },
                }),
            );

            expect(driveSearchModule.search.mock.calls[0][1]).toEqual({
                tag: 'Structured',
                value0: {
                    name: 'invoice',
                    parentUid: { volumeId: 'volume', nodeId: 'parent' },
                    mediaType: 'application/pdf',
                    createdBy: null,
                    ownedBy: null,
                    creationTime: { from: 1704067200n, to: null },
                    modificationTime: { from: null, to: 1706745600n },
                    lastAccessTime: null,
                    size: { from: 100n, to: null },
                },
            });
        });

        it('streams hits once per node, keeping the first', async () => {
            const { driveSearchModule, client } = setup();
            driveSearchModule.search.mockImplementation(async (_index, _query, sink) => {
                await sink.sendHit(hit('a', 3));
                await sink.sendHit(hit('b', 2));
                await sink.sendHit(hit('a', 1));
                return 0;
            });

            const results = await collect(client.query(SearchIndex.RecentNodes, 'invoice'));

            expect(results).toEqual([
                { nodeUid: makeNodeUid('volume', 'a'), score: 3 },
                { nodeUid: makeNodeUid('volume', 'b'), score: 2 },
            ]);
        });

        it('yields the hits before a drive search module failure, then throws', async () => {
            const { driveSearchModule, client } = setup();
            const error = new Error('search failed');
            driveSearchModule.search.mockImplementation(async (_index, _query, sink) => {
                await sink.sendHit(hit('a'));
                throw error;
            });

            const results: string[] = [];
            await expect(async () => {
                for await (const result of client.query(SearchIndex.RecentNodes, 'invoice')) {
                    results.push(result.nodeUid);
                }
            }).rejects.toBe(error);
            expect(results).toEqual([makeNodeUid('volume', 'a')]);
        });

        it('converts a drive search module cancellation to an AbortError', async () => {
            const { driveSearchModule, client } = setup();
            driveSearchModule.search.mockRejectedValue(new BoltFFICancelledError());

            await expect(collect(client.query(SearchIndex.RecentNodes, 'invoice'))).rejects.toThrow(AbortError);
        });
    });

    describe('nodesDeleted', () => {
        it('deletes the nodes from the drive search module', async () => {
            const { driveSearchModule, client } = setup();

            await client.nodesDeleted([makeNodeUid('volume', 'a'), makeNodeUid('volume', 'b')]);

            expect(driveSearchModule.delete).toHaveBeenCalledWith([
                { volumeId: 'volume', nodeId: 'a' },
                { volumeId: 'volume', nodeId: 'b' },
            ]);
        });
    });

    describe('getStatus', () => {
        it('is not implemented yet', async () => {
            const { client } = setup();

            await expect(client.getStatus()).rejects.toThrow('getStatus is not implemented yet');
        });
    });

    describe('getDebugInfo', () => {
        it('reports each index size and node count', async () => {
            const { driveSearchModule, client } = setup();
            driveSearchModule.counts[0] = 1n;

            expect(await client.getDebugInfo()).toEqual({
                indexes: [{ indexName: 'index-0', indexSizeBytes: 1000, indexedNodesCount: 1 }],
                extractingNodesCount: 0,
            });
        });
    });
});
