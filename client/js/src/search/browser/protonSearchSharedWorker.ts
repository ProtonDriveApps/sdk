import * as Comlink from 'comlink';

import { MemoryStorage, SearchClient } from '../core/index';
import { SearchSdkRelay, SearchWorkerApiAdapter } from './comlinkAdapter';

/**
 * Search module exposed to the main thread over Comlink, backed by the
 * fetch-based wasm bindings (browser).
 */
const sdkRelay = new SearchSdkRelay();

const searchClient = new SearchClient({
    loadWasm: () => fetch(new URL('../vendor/proton_drive_sdk_search_bg.wasm', import.meta.url)),
    // TODO: switch to an encrypted IndexedDB-backed storage (future MR) so the index survives the SharedWorker.
    storage: new MemoryStorage(),
    sdk: () => sdkRelay.get(),
});

const searchWorkerApi = new SearchWorkerApiAdapter(searchClient, sdkRelay);

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
