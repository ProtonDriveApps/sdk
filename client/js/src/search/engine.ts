import { type DriveSdkClient, DriveSearchEngine, type Storage } from './vendor/proton_drive_sdk_search.js';

/**
 * Builds the engine from an already-initialised wasm module.
 *
 * `storage` is supplied by the caller so each runtime can pick its own backend.
 */
export async function createEngine(sdkClient: DriveSdkClient, storage: Storage): Promise<DriveSearchEngine> {
    const engine = DriveSearchEngine.new(sdkClient, storage, generateCsprngSeed(), 50, 'proton-drive-sdk-search');
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
