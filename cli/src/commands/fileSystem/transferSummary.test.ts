import { ValidationError } from '@protontech/drive-sdk';

import { TransferSummary } from './transferSummary';

function summaryAsJson(summary: TransferSummary) {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    summary.print({ json: true });
    const result = JSON.parse(logSpy.mock.calls[0]![0] as string);
    logSpy.mockRestore();
    return result;
}

function summaryConsoleOutput(summary: TransferSummary): string[] {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    summary.print({ json: false });
    const lines = logSpy.mock.calls.map((call) => call[0] as string);
    logSpy.mockRestore();
    return lines;
}

describe('TransferSummary', () => {
    it('records successes and failures', () => {
        const summary = new TransferSummary('upload');
        summary.recordSuccess(1024);
        summary.recordSuccess(2048);
        summary.recordFailure('bad.txt', new Error('network error'));
        summary.recordFailure('remote.txt', 'checksum mismatch', 'uid-1');

        expect(summary.failureCount).toBe(2);
        expect(summary.formatProgressLine()).toBe('Uploaded 2 | Failed 2 | Queued 0');
        expect(summaryAsJson(summary)).toEqual({
            transferredItems: 2,
            transferredBytes: 3072,
            skippedItems: 0,
            failedItems: 2,
            failures: [
                { name: 'bad.txt', error: 'Error: network error' },
                { name: 'remote.txt', nodeUid: 'uid-1', error: 'checksum mismatch' },
            ],
        });
    });

    it('formats progress line with and without failures', () => {
        const downloadSummary = new TransferSummary('download');
        downloadSummary.setQueuedCount(3);
        expect(downloadSummary.formatProgressLine()).toBe('Downloaded 0 | Queued 3');

        const uploadSummary = new TransferSummary('upload');
        uploadSummary.recordSuccess();
        uploadSummary.recordFailure('bad.txt', new Error('network error'));
        uploadSummary.setQueuedCount(1);
        expect(uploadSummary.formatProgressLine()).toBe('Uploaded 1 | Failed 1 | Queued 1');
    });

    it('records error codes for ValidationError failures', () => {
        const summary = new TransferSummary('upload');
        summary.recordFailure('big.bin', new ValidationError('Storage quota exceeded', 200002));
        summary.recordFailure('bad.txt', new Error('network error'));

        expect(summary.hasFailureWithErrorCode(new Set([200002]))).toBe(true);
        expect(summary.hasFailureWithErrorCode(new Set([2011]))).toBe(false);
    });

    it('formats failure messages when printing json output', () => {
        const summary = new TransferSummary('upload');
        summary.recordFailure('bad.txt', new Error('network error'));
        summary.recordFailure('remote.txt', 'checksum mismatch');

        expect(summaryAsJson(summary)).toEqual({
            transferredItems: 0,
            transferredBytes: 0,
            skippedItems: 0,
            failedItems: 2,
            failures: [
                { name: 'bad.txt', error: 'Error: network error' },
                { name: 'remote.txt', error: 'checksum mismatch' },
            ],
        });
    });

    it('prints human-readable transfer summary to the console', () => {
        const summary = new TransferSummary('upload');
        summary.recordSuccess(1024);
        summary.recordSkip('skipped.txt', 'uid-1');
        summary.recordFailure('bad.txt', new Error('network error'));

        expect(summaryConsoleOutput(summary)).toEqual([
            'Transfer summary:',
            '  Uploaded: 1 items (1.00 KiB)',
            '  Skipped: 1 items',
            '  - skipped.txt (uid-1)',
            '  Failed: 1 items',
            '  - bad.txt: Error: network error',
        ]);
    });

    it('includes skipped only when there are skipped items', () => {
        const summary = new TransferSummary('upload');

        expect(summary.formatProgressLine()).toBe('Uploaded 0 | Queued 0');
        expect(summaryAsJson(summary)).toMatchObject({ skippedItems: 0 });

        summary.recordSkip('skipped.txt', 'uid-1');
        summary.recordSkip('skipped.txt', 'uid-2');
        summary.setQueuedCount(1);

        expect(summary.formatProgressLine()).toBe('Uploaded 0 | Skipped 2 | Queued 1');
        expect(summaryAsJson(summary)).toMatchObject({ skippedItems: 2 });
    });
});
