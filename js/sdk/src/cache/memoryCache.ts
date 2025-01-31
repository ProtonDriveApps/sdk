import type { ProtonDriveCache, EntityResult } from './interface.js';

type KeyValueCache = { [ uid: string ]: string };
type TagsCache = { [ key: string ]: { [ value: string ]: string[] } };

/**
 * In-memory cache implementation for Proton Drive SDK.
 * 
 * This cache is not persistent and is intended for mostly for testing or
 * development only. It is not recommended to use this cache in production
 * environments.
 */
export class MemoryCache implements ProtonDriveCache {
    private entities: KeyValueCache;
    private entitiesByTag: TagsCache;

    constructor(usedTagKeysBySDK: string[]) {
        this.entities = {};
        this.entitiesByTag = usedTagKeysBySDK.reduce((acc, key) => {
            acc[key] = {};
            return acc;
        }, {} as TagsCache);
    }

    async purge() {
        this.entities = {};
    }

    async setEntity(uid: string, data: string, tags?: { [ key: string ]: string }) {
        this.entities[uid] = data;
        if (tags) {
            for (const key in tags) {
                const value = tags[key];
                const tag = this.entitiesByTag[key];
                if (!tag) {
                    throw Error('Tag is not recognised');
                }
                if (!tag[value]) {
                    tag[value] = [];
                }
                tag[value].push(uid);
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

    async *iterateEntities(uids: string[]): AsyncGenerator<EntityResult> {
        for (const uid of uids) {
            try {
                const data = await this.getEntity(uid);
                yield { uid, ok: true, data };
            } catch (error) {
                yield { uid, ok: false, error: `${error}` };
            }
        }
    }

    async *iterateEntitiesByTag(key: string, value: string): AsyncGenerator<EntityResult> {
        const tag = this.entitiesByTag[key];
        if (!tag) {
            throw Error('Tag is not recognised');
        }

        const uids = tag[value];
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
            Object.entries(this.entitiesByTag).forEach(([ key, tag ]) => {
                Object.entries(tag).forEach(([ value, uids ]) => {
                    const index = uids.indexOf(uid);
                    if (index !== -1) {
                        uids.splice(index, 1);
                    }
                });
            });
        }
    }
};
