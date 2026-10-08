import { DriveSearchEngine, type HttpClient, type Storage } from './vendor/proton_drive_sdk_search.js';

/**
 * Builds the engine from an already-initialised wasm module.
 *
 * `storage` and `http` are supplied by the caller so each runtime can pick its
 * own backend. `http` reaches the Drive API with paths relative to its base URL.
 */
export async function createEngine(storage: Storage, http: HttpClient): Promise<DriveSearchEngine> {
    const engine = DriveSearchEngine.new(
        storage,
        http,
        generateCsprngSeed(),
        // wasm has no clock of its own; the engine reads seconds since the Unix epoch.
        { now: () => BigInt(Math.floor(Date.now() / 1000)) },
        'proton-drive-sdk-search',
    );
    if (!engine) {
        throw new Error('Failed to construct DriveSearchEngine');
    }
    await engine.init();
    return engine;
}

/* The client needs to provide a random generator for the DriveSearchEngine. */
function generateCsprngSeed(): bigint {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return new DataView(bytes.buffer).getBigUint64(0);
}
