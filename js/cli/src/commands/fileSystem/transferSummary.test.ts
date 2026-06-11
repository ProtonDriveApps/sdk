import { TransferSummary } from './transferSummary';

function summaryAsJson(summary: TransferSummary) {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    summary.print({ json: true });
    const result = JSON.parse(logSpy.mock.calls[0]![0] as string);
    logSpy.mockRestore();
    return result;
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

    it('includes skipped only when there are skipped items', () => {
        const summary = new TransferSummary('upload');

        expect(summary.formatProgressLine()).toBe('Uploaded 0 | Queued 0');
        expect(summaryAsJson(summary)).toMatchObject({ skippedItems: 0 });

        summary.recordSkip();
        summary.recordSkip();
        summary.setQueuedCount(1);

        expect(summary.formatProgressLine()).toBe('Uploaded 0 | Skipped 2 | Queued 1');
        expect(summaryAsJson(summary)).toMatchObject({ skippedItems: 2 });
    });
});
