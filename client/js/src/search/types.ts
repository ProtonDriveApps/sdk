/**
 * The search service client.
 *
 * NOTE: Only wires up `enable()` to prove the wasm boundary works end to end; the
 * real search/callback-relay surface is follow-on work.
 */
export interface ProtonDriveSearchClient {
    enable(): Promise<void>;
}

/**
 * Provides a Search service implementation.
 *
 * Each implementation can be tailored to its runtime environment e.g.:
 *  - For the web browser version, it could be using web APIs like SharedWorker.
 *  - For the CLI node version, it should only use node APIs (e.g. Worker instead of WebWorker).
 */
export interface SearchServiceProvider {
    start(sdkVersion: string, addressId: string): Promise<ProtonDriveSearchClient>;
}
