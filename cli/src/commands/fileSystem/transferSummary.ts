import { ValidationError } from '@protontech/drive-sdk';

import { formatSize, sanitizeTerminalText } from '../../cli/formatters';

type TransferSkip = {
    name: string;
    nodeUid?: string;
};

type TransferFailure = {
    name: string;
    nodeUid?: string;
    error: unknown;
};

export type TransferCounters = {
    transferredItems: number;
    transferredBytes: number;
    skippedItems: number;
    failedItems: number;
};

export type TransferFailureDetail = {
    name: string;
    nodeUid?: string;
    error: string;
};

export class TransferSummary {
    private successCount = 0;
    private transferredBytes = 0;
    private skipped: TransferSkip[] = [];
    private queuedCount = 0;
    private readonly failures: TransferFailure[] = [];

    constructor(private readonly operation: 'upload' | 'download') {}

    get failureCount(): number {
        return this.failures.length;
    }

    getCounters(): TransferCounters {
        return {
            transferredItems: this.successCount,
            transferredBytes: this.transferredBytes,
            skippedItems: this.skipped.length,
            failedItems: this.failures.length,
        };
    }

    getFailureDetails(): TransferFailureDetail[] {
        return this.failures.map((failure) => ({
            name: failure.name,
            nodeUid: failure.nodeUid,
            error: formatTransferErrorMessage(failure.error),
        }));
    }

    hasFailureWithErrorCode(errorCodes: ReadonlySet<number>): boolean {
        return this.failures.some(
            (failure) =>
                failure.error instanceof ValidationError &&
                failure.error.code !== undefined &&
                errorCodes.has(failure.error.code),
        );
    }

    setQueuedCount(count: number): void {
        this.queuedCount = count;
    }

    recordSuccess(bytes = 0): void {
        this.successCount++;
        this.transferredBytes += bytes;
    }

    recordSkip(name: string, nodeUid?: string): void {
        this.skipped.push({ name, nodeUid });
    }

    recordFailure(name: string, error: unknown, nodeUid?: string): void {
        this.failures.push({ name, nodeUid, error });
    }

    formatProgressLine(): string {
        const verb = this.operation === 'upload' ? 'Uploaded' : 'Downloaded';
        const parts = [`${verb} ${this.successCount}`];
        if (this.failures.length > 0) {
            parts.push(`Failed ${this.failures.length}`);
        }
        if (this.skipped.length > 0) {
            parts.push(`Skipped ${this.skipped.length}`);
        }
        parts.push(`Queued ${this.queuedCount}`);
        return parts.join(' | ');
    }

    print(options: { json: boolean }): void {
        if (options.json) {
            console.log(
                JSON.stringify({
                    ...this.getCounters(),
                    failures: this.getFailureDetails(),
                }),
            );
            return;
        }

        console.log('Transfer summary:');

        const verb = this.operation === 'upload' ? 'Uploaded' : 'Downloaded';
        console.log(`  ${verb}: ${this.successCount} items (${formatSize(this.transferredBytes, true)})`);

        if (this.skipped.length > 0) {
            console.log(`  Skipped: ${this.skipped.length} items`);
            for (const skip of this.skipped) {
                const uidPart = skip.nodeUid ? ` (${skip.nodeUid})` : '';
                console.log(`  - ${sanitizeTerminalText(skip.name)}${uidPart}`);
            }
        }

        if (this.failures.length > 0) {
            console.log(`  Failed: ${this.failures.length} items`);
            for (const failure of this.failures) {
                const uidPart = failure.nodeUid ? ` (${failure.nodeUid})` : '';
                console.log(
                    `  - ${sanitizeTerminalText(failure.name)}${uidPart}: ${sanitizeTerminalText(formatTransferErrorMessage(failure.error))}`,
                );
            }
        }
    }
}

export function formatTransferErrorMessage(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
