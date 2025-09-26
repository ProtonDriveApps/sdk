import { ProtonDriveTelemetry } from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import { NodesDebouncer } from './debouncer';

describe('NodesDebouncer', () => {
    let debouncer: NodesDebouncer;
    let mockTelemetry: ReturnType<typeof getMockTelemetry>;

    beforeEach(() => {
        mockTelemetry = getMockTelemetry();
        debouncer = new NodesDebouncer(mockTelemetry);

        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        debouncer.clear();
    });

    it('should register a node for loading and wait for it to finish', async () => {
        const nodeUid = 'test-node-1';
        debouncer.loadingNode(nodeUid);

        // Verify that the node is registered by checking if waitForLoadingNode works
        const waitPromise = debouncer.waitForLoadingNode(nodeUid);
        expect(waitPromise).toBeInstanceOf(Promise);

        // Finish loading to clean up
        debouncer.finishedLoadingNode(nodeUid);
        await waitPromise;
    });

    it('should allow multiple nodes to be registered', async () => {
        const nodeUid1 = 'test-node-1';
        const nodeUid2 = 'test-node-2';

        debouncer.loadingNode(nodeUid1);
        debouncer.loadingNode(nodeUid2);

        const wait1 = debouncer.waitForLoadingNode(nodeUid1);
        const wait2 = debouncer.waitForLoadingNode(nodeUid2);

        expect(wait1).toBeInstanceOf(Promise);
        expect(wait2).toBeInstanceOf(Promise);

        debouncer.finishedLoadingNode(nodeUid1);
        debouncer.finishedLoadingNode(nodeUid2);
        await Promise.all([wait1, wait2]);
    });

    it('should register multiple nodes at once', async () => {
        const nodeUid1 = 'test-node-1';
        const nodeUid2 = 'test-node-2';

        debouncer.loadingNodes([nodeUid1, nodeUid2]);

        const wait1 = debouncer.waitForLoadingNode(nodeUid1);
        const wait2 = debouncer.waitForLoadingNode(nodeUid2);

        expect(wait1).toBeInstanceOf(Promise);
        expect(wait2).toBeInstanceOf(Promise);

        debouncer.finishedLoadingNode(nodeUid1);
        debouncer.finishedLoadingNode(nodeUid2);
        await Promise.all([wait1, wait2]);
    });

    it('should warn about registering the same node twice', async () => {
        const nodeUid = 'test-node-1';

        // Register the same node twice
        debouncer.loadingNode(nodeUid);
        debouncer.loadingNode(nodeUid);

        expect(mockTelemetry.mockLogger.warn).toHaveBeenCalledWith(`Loading twice for: ${nodeUid}`);
    });

    it('should send metric when waiting for a long time', async () => {
        const nodeUid = 'test-node-1';
        debouncer.loadingNode(nodeUid);

        const waitPromise = debouncer.waitForLoadingNode(nodeUid);
        expect(mockTelemetry.recordMetric).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1500);
        expect(mockTelemetry.recordMetric).toHaveBeenCalledWith({
            eventName: 'debounceLongWait',
        });

        debouncer.finishedLoadingNode(nodeUid);
        await waitPromise;
    });

    it('should timeout', async () => {
        const nodeUid = 'test-node-1';
        debouncer.loadingNode(nodeUid);

        jest.advanceTimersByTime(6000);
        expect(mockTelemetry.mockLogger.warn).toHaveBeenCalledWith(`Timeout for: ${nodeUid}`);
        await expect(debouncer.waitForLoadingNode(nodeUid)).resolves.toBeUndefined();
    });

    describe('finishedLoadingNode', () => {
        it('should handle non-existent node gracefully', async () => {
            const nodeUid = 'non-existent-node';

            expect(() => debouncer.finishedLoadingNode(nodeUid)).not.toThrow();
        });

        it('should remove node from internal map after finishing', async () => {
            const nodeUid = 'test-node-1';
            debouncer.loadingNode(nodeUid);
            debouncer.finishedLoadingNode(nodeUid);

            const waitPromise = debouncer.waitForLoadingNode(nodeUid);
            await expect(waitPromise).resolves.toBe(undefined);
        });
    });

    describe('waitForLoadingNode', () => {
        it('should return immediately for non-registered node', async () => {
            const nodeUid = 'non-existent-node';

            const result = await debouncer.waitForLoadingNode(nodeUid);
            expect(result).toBeUndefined();
            expect(mockTelemetry.mockLogger.debug).not.toHaveBeenCalled();
        });

        it('should wait for registered node and log debug message', async () => {
            const nodeUid = 'test-node-1';
            debouncer.loadingNode(nodeUid);

            const waitPromise = debouncer.waitForLoadingNode(nodeUid);

            expect(mockTelemetry.mockLogger.debug).toHaveBeenCalledWith(`Wait for: ${nodeUid}`);

            debouncer.finishedLoadingNode(nodeUid);
            await waitPromise;
        });
    });
});
