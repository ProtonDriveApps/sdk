import * as Comlink from 'comlink';

import type { SearchSdkCapabilities } from '../sdkCapabilities';
import { type ProtonDriveSearchClient, SearchIndex } from '../types';
import { SearchSdkRelay, SearchWorkerApiAdapter } from './comlinkAdapter';

const sdk = (): SearchSdkCapabilities => ({ loadNodes: jest.fn(), apiRequest: jest.fn() });

describe('SearchSdkRelay', () => {
    it('hands out the SDK of the run in progress only', async () => {
        const relay = new SearchSdkRelay();
        const first = sdk();

        expect(await relay.run(first, async () => relay.get())).toBe(first);
        expect(() => relay.get()).toThrow('only available during a run');
    });

    it('runs one at a time, each with its own SDK', async () => {
        const relay = new SearchSdkRelay();
        const first = sdk();
        const second = sdk();
        let finishFirst: (() => void) | undefined;
        const seen: SearchSdkCapabilities[] = [];

        const firstRun = relay.run(first, async () => {
            await new Promise<void>((resolve) => (finishFirst = resolve));
            seen.push(relay.get());
        });
        const secondRun = relay.run(second, async () => {
            seen.push(relay.get());
        });
        while (!finishFirst) {
            await Promise.resolve();
        }
        finishFirst();
        await Promise.all([firstRun, secondRun]);

        expect(seen).toEqual([first, second]);
    });

    it('keeps running after a failed run', async () => {
        const relay = new SearchSdkRelay();
        const second = sdk();

        await expect(
            relay.run(sdk(), async () => {
                throw new Error('failed');
            }),
        ).rejects.toThrow('failed');

        expect(await relay.run(second, async () => relay.get())).toBe(second);
    });
});

describe('SearchWorkerApiAdapter', () => {
    function setup() {
        const relay = new SearchSdkRelay();
        const seen: SearchSdkCapabilities[] = [];
        const searchClient = {
            runIndexing: jest.fn(async () => {
                seen.push(relay.get());
                return { recommendedNextCallAfterMs: 0 };
            }),
            runExtraction: jest.fn(async () => {
                seen.push(relay.get());
                return { recommendedNextCallAfterMs: 0 };
            }),
        } as unknown as ProtonDriveSearchClient;
        return { seen, adapter: new SearchWorkerApiAdapter(searchClient, relay) };
    }

    it('runs indexing and extraction with the SDK of the call, then releases it', async () => {
        const { seen, adapter } = setup();
        const indexingSdk = { ...sdk(), [Comlink.releaseProxy]: jest.fn() };
        const extractionSdk = { ...sdk(), [Comlink.releaseProxy]: jest.fn() };

        await adapter.runIndexing(indexingSdk, [SearchIndex.RecentNodes]);
        await adapter.runExtraction(extractionSdk);

        expect(seen).toEqual([indexingSdk, extractionSdk]);
        expect(indexingSdk[Comlink.releaseProxy]).toHaveBeenCalled();
        expect(extractionSdk[Comlink.releaseProxy]).toHaveBeenCalled();
    });
});
