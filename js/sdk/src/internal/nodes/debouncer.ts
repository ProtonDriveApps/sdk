import { Logger } from "../../interface";
import { LoggerWithPrefix } from '../../telemetry';

/**
 * The timeout for which the node is considered to be loading.
 * If the node is not loaded after this timeout, it is considered to be
 * loaded or failed to be loaded, and allowed other places to proceed.
 *
 * Decrypting many nodes in parallel can take a lot of time, so we allow
 * more time for this.
 */
const DEBOUNCE_TIMEOUT = 5000;

/**
 * Helper to avoid loading the same node twice.
 *
 * Each place that loads a node should report it is being loaded,
 * and when it is finished, it should report it is finished.
 * The finish must be called even if the node fails to be loaded
 * to clear the promise.
 *
 * Each place that loads a node from cache should first wait for
 * the node to be loaded if that is the case.
 */
export class NodesDebouncer {
    private promises: Map<
        string,
        {
            promise: Promise<void>;
            resolve: () => void;
            timeout: NodeJS.Timeout;
        }
    > = new Map();

    constructor(private logger: Logger) {
        this.logger = new LoggerWithPrefix(logger, 'debouncer');
    }

    loadingNodes(nodeUids: string[]) {
        for (const nodeUid of nodeUids) {
            this.loadingNode(nodeUid);
        }
    }

    loadingNode(nodeUid: string) {
        const { promise, resolve } = Promise.withResolvers<void>();
        if (this.promises.has(nodeUid)) {
            this.logger.warn(`Loading twice for: ${nodeUid}`);
            return;
        }

        const timeout = setTimeout(() => {
            this.logger.warn(`Timeout for: ${nodeUid}`);
            this.finishedLoadingNode(nodeUid);
        }, DEBOUNCE_TIMEOUT);
        this.promises.set(nodeUid, { promise, resolve, timeout });
    }

    finishedLoadingNodes(nodeUids: string[]) {
        for (const nodeUid of nodeUids) {
            this.finishedLoadingNode(nodeUid);
        }
    }

    finishedLoadingNode(nodeUid: string) {
        const result = this.promises.get(nodeUid);
        if (!result) {
            return;
        }

        clearTimeout(result.timeout);
        result.resolve();
        this.promises.delete(nodeUid);
    }

    async waitForLoadingNode(nodeUid: string) {
        const result = this.promises.get(nodeUid);
        if (!result) {
            return;
        }

        this.logger.debug(`Wait for: ${nodeUid}`);
        await result.promise;
    }

    clear() {
        for (const result of this.promises.values()) {
            clearTimeout(result.timeout);
            result.resolve();
        }
        this.promises.clear();
    }
}
