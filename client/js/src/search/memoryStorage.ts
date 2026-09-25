import { wireOk } from '@boltffi/runtime';

import type { Storage } from './vendor/proton_drive_sdk_search.js';

/**
 * In-memory search index storage, usable from any runtime. The index is lost
 * when the process (CLI) or SharedWorker (browser) goes away.
 *
 * Object results (`Ack`) are wrapped in `wireOk`: boltffi can't tell a bare
 * object from a `WireResult` and rejects it as ambiguous.
 */
export function createMemoryStorage(): Storage {
    const entries = new Map<string, Uint8Array>();
    return {
        store: async (key, val) => {
            entries.set(key.inner, val);
            return wireOk({});
        },
        load: async (key) => entries.get(key.inner) ?? null,
        remove: async (key) => {
            entries.delete(key.inner);
            return wireOk({});
        },
        removeAll: async () => {
            entries.clear();
            return wireOk({});
        },
    };
}
