import { wireOk } from '@boltffi/runtime';

import type { Storage, StorageKey } from '../vendor/proton_drive_sdk_search.js';

/**
 * In-memory search index storage, usable from any runtime. The index is lost
 * when the process (CLI) or SharedWorker (browser) goes away.
 *
 * Object results (`Ack`) are wrapped in `wireOk`: boltffi can't tell a bare
 * object from a `WireResult` and rejects it as ambiguous.
 */
export class MemoryStorage implements Storage {
    private entries = new Map<string, Uint8Array>();

    async store(key: StorageKey, val: Uint8Array) {
        this.entries.set(key.inner, val);
        return wireOk({});
    }

    async load(key: StorageKey) {
        return this.entries.get(key.inner) ?? null;
    }

    async remove(key: StorageKey) {
        this.entries.delete(key.inner);
        return wireOk({});
    }

    async removeAll() {
        this.entries.clear();
        return wireOk({});
    }
}
