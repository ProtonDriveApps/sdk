import type { ProtonDriveCache, EntityResult } from './interface';

/**
 * Null cache implementation for Proton Drive SDK.
 *
 * This cache is not caching anything. It can be used to disable the cache.
 */
export class NullCache<T> implements ProtonDriveCache<T> {
    async clear() {
        // No-op.
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async setEntity(key: string, value: T, tags?: string[]) {
        // No-op.
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getEntity(key: string): Promise<T> {
        throw Error('Entity not found');
    }

    async *iterateEntities(keys: string[]): AsyncGenerator<EntityResult<T>> {
        for (const key of keys) {
            yield { key, ok: false, error: 'Entity not found' };
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async *iterateEntitiesByTag(tag: string): AsyncGenerator<EntityResult<T>> {
        // No-op.
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async removeEntities(keys: string[]) {
        // No-op.
    }
};
