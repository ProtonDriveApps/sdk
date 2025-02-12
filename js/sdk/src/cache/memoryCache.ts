import type { ProtonDriveCache, EntityResult } from './interface.js';

type KeyValueCache<T> = { [ uid: string ]: T };
type TagsCache = { [ tag: string ]: string[] };

/**
 * In-memory cache implementation for Proton Drive SDK.
 * 
 * This cache is not persistent and is intended for mostly for testing or
 * development only. It is not recommended to use this cache in production
 * environments.
 */
export class MemoryCache<T> implements ProtonDriveCache<T> {
    private entities: KeyValueCache<T> = {};
    private entitiesByTag: TagsCache = {};

    async purge() {
        this.entities = {};
    }

    async setEntity(uid: string, data: T, tags?: string[]) {
        this.entities[uid] = data;
        if (tags) {
            for (const tag of tags) {
                if (!this.entitiesByTag[tag]) {
                    this.entitiesByTag[tag] = [];
                }
                this.entitiesByTag[tag].push(uid);
            }
        }
    }

    async getEntity(uid: string) {
        const data = this.entities[uid];
        if (!data) {
            throw Error('Entity not found');
        }
        return data;
    }

    async *iterateEntities(uids: string[]): AsyncGenerator<EntityResult<T>> {
        for (const uid of uids) {
            try {
                const data = await this.getEntity(uid);
                yield { uid, ok: true, data };
            } catch (error) {
                yield { uid, ok: false, error: `${error}` };
            }
        }
    }

    async *iterateEntitiesByTag(tag: string): AsyncGenerator<EntityResult<T>> {
        const uids = this.entitiesByTag[tag];
        if (!uids) {
            return;
        }

        // Pass copy of UIDs so concurrent changes to the cache do not affect
        // results from iterating entities.
        yield* this.iterateEntities([...uids]);
    }

    async removeEntities(uids: string[]) {
        for (const uid of uids) {
            delete this.entities[uid];
            Object.values(this.entitiesByTag).forEach((uids) => {
                const index = uids.indexOf(uid);
                if (index !== -1) {
                    uids.splice(index, 1);
                }
            });
        }
    }
};
