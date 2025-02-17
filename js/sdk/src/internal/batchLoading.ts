const DEFAULT_BATCH_LOADING = 10;

/**
 * Helper class for batch loading items.
 * 
 * The class is responsible for fetching items in batches. Any call to
 * `load` will add the item to the batch (without fetching anything),
 * and if the batch reaches the limit, it will fetch the items and yield
 * them transparently to the caller.
 * 
 * Example:
 * 
 * ```typescript
 * const batchLoading = new BatchLoading<string, DecryptedNode>({ loadItems: loadNodesCallback });
 * for (const nodeUid of nodeUids) {
 *   for await (const node of batchLoading.load(nodeUid)) {
 *     console.log(node);
 *   }
 * }
 * for await (const node of batchLoading.loadRest()) {
 *  console.log(node);
 * }
 * ```
 */
export class BatchLoading<ID, ITEM> {
    private batchSize = DEFAULT_BATCH_LOADING;
    private iterateItems: (ids: ID[]) => AsyncGenerator<ITEM>;

    private itemsToFetch: ID[];

    constructor(options: {
        loadItems?: (ids: ID[]) => Promise<ITEM[]>,
        iterateItems?: (ids: ID[]) => AsyncGenerator<ITEM>,
        batchSize?: number,
    }) {
        this.itemsToFetch = [];
        
        if (options.loadItems) {
            const loadItems = options.loadItems;
            this.iterateItems = async function* (ids: ID[]) {
                for (const item of await loadItems(ids)) {
                    yield item;
                }
            }
        } else if (options.iterateItems) {
            this.iterateItems = options.iterateItems;
        } else {
            throw new Error('Either loadItems or iterateItems must be provided');
        }

        if (options.batchSize) {
            this.batchSize = options.batchSize;
        }
    }

    async *load(nodeUid: ID) {
        this.itemsToFetch.push(nodeUid);

        if (this.itemsToFetch.length >= this.batchSize) {
            yield* this.iterateItems(this.itemsToFetch);
            this.itemsToFetch = [];
        }
    }

    async *loadRest() {
        if (this.itemsToFetch.length === 0) {
            return;
        }

        yield* this.iterateItems(this.itemsToFetch);
        this.itemsToFetch = [];
    }
}
