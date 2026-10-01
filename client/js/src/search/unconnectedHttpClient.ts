import { wireErr } from '@boltffi/runtime';

import type { HttpClient } from './vendor/proton_drive_sdk_search.js';

/**
 * Placeholder for the engine's Drive API access: every request fails with
 * `RequestFailed`, so indexing from the backend queue does nothing yet.
 *
 * TODO: replace with a client that reaches the Drive API through the caller's
 * `ProtonDriveClient` (base URL, auth and session headers).
 */
export function createUnconnectedHttpClient(): HttpClient {
    const notConnected = async () =>
        wireErr({ tag: 'RequestFailed', value0: 'HTTP client not connected yet' } as const);
    return { get: notConnected, put: notConnected, post: notConnected };
}
