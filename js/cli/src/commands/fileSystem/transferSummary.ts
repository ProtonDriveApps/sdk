import { formatSize, sanitizeTerminalText } from '../../cli/formatters';

type TransferFailure = {
    name: string;
    nodeUid?: string;
    error: string;
};

export class TransferSummary {
    private successCount = 0;
    private transferredBytes = 0;
    private skippedCount = 0;
    private queuedCount = 0;
    private readonly failures: TransferFailure[] = [];

    constructor(private readonly operation: 'upload' | 'download') {}

    get failureCount(): number {
        return this.failures.length;
    }

    setQueuedCount(count: number): void {
        this.queuedCount = count;
    }

    recordSuccess(bytes = 0): void {
        this.successCount++;
        this.transferredBytes += bytes;
    }

    recordSkip(): void {
        this.skippedCount++;
    }

    recordFailure(name: string, error: unknown, nodeUid?: string): void {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        this.failures.push({ name, nodeUid, error: message });
    }

    formatProgressLine(): string {
        const verb = this.operation === 'upload' ? 'Uploaded' : 'Downloaded';
        const parts = [`${verb} ${this.successCount}`];
        if (this.failures.length > 0) {
            parts.push(`Failed ${this.failures.length}`);
        }
        if (this.skippedCount > 0) {
            parts.push(`Skipped ${this.skippedCount}`);
        }
        parts.push(`Queued ${this.queuedCount}`);
        return parts.join(' | ');
    }

    print(options: { json: boolean }): void {
        if (options.json) {
            console.log(
                JSON.stringify({
                    transferredItems: this.successCount,
                    transferredBytes: this.transferredBytes,
                    skippedItems: this.skippedCount,
                    failedItems: this.failures.length,
                    failures: this.failures,
                }),
            );
            return;
        }

        console.log('Transfer summary:');

        const verb = this.operation === 'upload' ? 'Uploaded' : 'Downloaded';
        console.log(`  ${verb}: ${this.successCount} items (${formatSize(this.transferredBytes, true)})`);

        if (this.skippedCount > 0) {
            console.log(`  Skipped: ${this.skippedCount} items`);
        }

        if (this.failures.length > 0) {
            console.log(`  Failed: ${this.failures.length} items`);
            for (const failure of this.failures) {
                const uidPart = failure.nodeUid ? ` (${failure.nodeUid})` : '';
                console.log(
                    `  - ${sanitizeTerminalText(failure.name)}${uidPart}: ${sanitizeTerminalText(failure.error)}`,
                );
            }
        }
    }
}
