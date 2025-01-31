export interface ProtonDriveCacheConstructor {
    /**
     * Initialize the cache.
     * 
     * The local database should follow document-based structure. The SDK does
     * serialisation and data is not intended to be read by 3rd party. The SDK,
     * however, provides also clear fields in form of tags that is used for
     * search. Local database should have indexes, columns, or other structure
     * for easier look-up. The list of used tags by the SDK is passed via
     * `usedTagKeysBySDK` parameter.
     * 
     * See {@link setEntity} for more details how tags are used.
     * 
     * @param usedTagKeysBySDK - Example of tags: ["trashed", "shared", "parentUid"]
     */
     new (usedTagKeysBySDK: string[]): ProtonDriveCache,
}

export interface ProtonDriveCache {

    /**
     * Re-creates the whole persistent cache.
     * 
     * The SDK can call this when there is some inconsistency and it is better
     * to start from scratch rather than fix it.
     */
    purge(): Promise<void>,

    /**
     * Adds or updates entity in the local database.
     * 
     * The `data` doesn't include any keys. It is up to the client store this
     * information privately.
     * 
     * The `tags` is an object that should be stored properly for fast look-up.
     * The SDK provides list of used tags by the SDK in the {@link "constructor"}.
     * 
     * @example Usage by the SDK
     * ```ts
     * await cache.setEntity("node-abc42", "{ node abc42 serialised data }", { "parentUid": "abc123", "shared": "withMe" });
     * await Array.fromAsync(cache.iterateEntitiesByTag("parentUid", "abc123")); // returns ["node-abc42"]
     * await cache.getEntity("node-abc42"); // returns "{ node abc42 serialised data }"
     * await Array.fromAsync(cache.iterateEntities(["node-abc42"])); // returns ["{ node abc42 serialised data }"]
     * ```
     * 
     * @example Stored data
     * ```json
     * {
     *     type: "node",
     *     version: 1,
     *     internal: {
     *         isStale,
     *         claimedDigests,
     *         // ...
     *     }
     *     node: {
     *         // same as node entity, here some example
     *         uid,
     *         parentUid,
     *         // ...
     *     }
     * }
     * ```
     * 
     * @param uid - UID is internal ID controlled by the SDK. It combines type and ID of the entity.
     * @param data - Serialised JSON object controlled by the SDK. It is not intended for use outside of the SDK.
     * @param tags - Clear metadata about the entity used for filtering. It is intended to store efficiently for fast look-up.
     * @throws Exception if `key` from `tags` is not one of the tag keys provided from `usedTagKeysBySDK` in constructor.
     */
    setEntity(uid: string, data: string, tags?: { [ key: string ]: string }): Promise<void>,
    
    /**
     * Returns the data of the entity stored locally.
     * 
     * @throws Exception if entity is not present.
     */
    getEntity(uid: string): Promise<string>,

    /**
     * Generator providing the data of the entities stored locally for given
     * list of UIDs.
     * 
     * No exception is thrown when data is missing.
     */
    iterateEntities(uids: string[]): AsyncGenerator<EntityResult>,

    /**
     * Generator providing the data of the entities stored locally for given
     * filter option.
     * 
     * No exception is thrown when data is missing.
     * 
     * @example Usage by the SDK
     * ```ts
     * await cache.setEntity("node-abc42", "{ node abc42 serialised data }", { "parentUid": "abc123", "shared": "withMe" });
     * await Array.fromAsync(cache.iterateEntitiesByTag("parentUid", "abc123")); // returns ["node-abc42"]
     * ```
     * 
     * @param key - The tag key, for example `parentUid`
     * @param value - The tag value, for example `"abc123"`
     * @throws Exception if `key` is not one of the tag keys provided from `usedTagKeysBySDK` in constructor
     */
    iterateEntitiesByTag(key: string, value: string): AsyncGenerator<EntityResult>,

    /**
     * Removes completely the entity stored locally from the database.
     * 
     * It is no-op if entity is not present.
     */
    removeEntities(uids: string[]): Promise<void>,
}

export type EntityResult = {uid: string, ok: true, data: string} | {uid: string, ok: false, error: string};
