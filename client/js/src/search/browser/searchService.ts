import * as Comlink from 'comlink';
import { c } from 'ttag';

import { ValidationError } from '../../errors';
import type { ProtonDriveSearchClient } from '../types';

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
