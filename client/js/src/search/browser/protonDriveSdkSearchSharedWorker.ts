import * as Comlink from 'comlink';

import { createEngine } from '../engine';
import { createMemoryStorage } from '../memoryStorage';
import type { ProtonDriveSearchClient } from '../types';
import { createUnconnectedHttpClient } from '../unconnectedHttpClient';
import init, { DriveSearchEngine } from '../vendor/proton_drive_sdk_search.js';

let enginePromise: Promise<DriveSearchEngine> | undefined;

function getEngine() {
    enginePromise ??= (async () => {
        await init(await fetch(new URL('../vendor/proton_drive_sdk_search_bg.wasm', import.meta.url)));
        return createEngine(
            // TODO: switch to an encrypted IndexedDB-backed storage (future MR) so the index survives the SharedWorker.
            createMemoryStorage(),
            createUnconnectedHttpClient(),
        );
    })();
    return enginePromise;
}

/**
 * Search API exposed to the main thread over Comlink, backed by the
 * fetch-based wasm bindings (browser).
 */
export const searchWorkerApi: ProtonDriveSearchClient = {
    async enable(): Promise<void> {
        const engine = await getEngine();
        await engine.setEnabled(true);
    },
};

/**
 * `lib.webworker.d.ts` isn't included in this package's tsconfig (it conflicts
 * with `lib.dom.d.ts`'s globals), so the bit of SharedWorker global scope this
 * file needs is declared locally instead.
 */
declare const self: {
    onconnect: ((event: MessageEvent) => void) | null;
};

self.onconnect = (event: MessageEvent) => {
    const port = event.ports[0] as MessagePort;
    Comlink.expose(searchWorkerApi, port);
    port.start();
};
