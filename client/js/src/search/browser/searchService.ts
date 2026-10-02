import * as Comlink from 'comlink';
import { c } from 'ttag';

import { ValidationError } from '../../errors';
import type { ProtonDriveSearchClient, SearchServiceProvider } from '../types';

/**
 * Browser search service provider to pass as `searchServiceProvider` to
 * `ProtonDriveClient`.
 *
 * Search is opt-in: the SDK never references this module itself, so bundlers
 * of applications that don't import it never process the search worker or wasm.
 *
 * ```ts
 * import { browserSearchServiceProvider } from '@protontech/drive-sdk/dist/search/browser/searchService';
 *
 * new ProtonDriveClient({ ..., searchServiceProvider: browserSearchServiceProvider });
 * ```
 *
 * The search implementation relies on web APIs (SharedWorker, Web Locks,
 * workers nested in a shared worker) that not every browser provides (e.g.
 * Safari 15/16). To keep it code-split from the main bundle, import it lazily:
 *
 * ```ts
 * const searchServiceProvider: SearchServiceProvider = {
 *     start: async (sdkVersion, addressId) => {
 *         const { browserSearchServiceProvider } = await import(
 *             '@protontech/drive-sdk/dist/search/browser/searchService'
 *         );
 *         return browserSearchServiceProvider.start(sdkVersion, addressId);
 *     },
 * };
 * ```
 *
 * Bundler setup: the search worker loads the engine wasm at runtime with
 * `fetch(new URL('…/proton_drive_sdk_search_bg.wasm', import.meta.url))` and
 * instantiates it itself, supplying the wasm imports (the `env` module) from JS.
 * The bundler must therefore emit the `.wasm` file as a plain static asset and
 * rewrite the URL to it. It must not compile it as a WebAssembly module: a
 * bundler doing so treats the wasm imports as JS modules to resolve, and the
 * build fails (with webpack: `Can't resolve 'env'`).
 *
 * Webpack 5 emits `new URL(…, import.meta.url)` targets as assets by default,
 * unless the config sets a `.wasm` rule with
 * `type: 'webassembly/async'` (used with `experiments.asyncWebAssembly`), which
 * takes precedence. In that case, add a rule emitting the wasm as an asset
 * (narrow `test` to `/proton_drive_sdk_search_bg\.wasm$/` if other wasm
 * modules rely on the async rule):
 *
 * ```ts
 * config.module?.rules.push({
 *     test: /\.wasm$/,
 *     type: 'asset/resource',
 * });
 * ```
 *
 * TODO: expose a nicer import path without `dist` (e.g. `@protontech/drive-sdk/search/browser`)
 * via a package.json `exports` map, keeping `./dist/*` for existing deep imports.
 */
export const browserSearchServiceProvider: SearchServiceProvider = {
    start: async (sdkVersion, addressId) => start(sdkVersion, addressId),
};

/**
 * Runs the engine in a `SharedWorker`, so same-origin tabs share one search engine
 * instead of each duplicating the work.
 */
export function start(sdkVersion: string, addressId: string): ProtonDriveSearchClient {
    if (typeof SharedWorker === 'undefined') {
        // TODO: centralize proper browser capability detection instead of throwing here.
        throw new ValidationError(
            c('Error').t`Your browser does not support features required for the search.`,
        );
    }

    const worker = new SharedWorker(new URL('./protonDriveSdkSearchSharedWorker.js', import.meta.url), {
        name: getSearchWorkerName(sdkVersion, addressId),
        type: 'module',
    });
    worker.port.start();
    return Comlink.wrap<ProtonDriveSearchClient>(worker.port);
}

/**
 * A SharedWorker is shared by name across same-origin tabs, so the name is
 * scoped to the SDK version (avoid a stale worker from a previous version
 * being reused) and to the address (avoid two accounts sharing one worker/index).
 */
function getSearchWorkerName(sdkVersion: string, addressId: string): string {
    return `proton-drive-search:${sdkVersion}:${addressId}`;
}

export const getSearchWorkerNameForTesting = getSearchWorkerName;
