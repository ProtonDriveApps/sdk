import { FileDownloader } from '../../../sdk/src/interface';

export async function download({
    downloader,
    downloadingName,
    localPath,
    json,
}: {
    downloader: FileDownloader;
    downloadingName: string;
    localPath: string;
    json: boolean;
}) {

    const claimedSize = downloader.getClaimedSizeInBytes();

    if (!json) {
        console.log(`Downloading ${downloadingName} (${claimedSize || 'N/A'} bytes) to ${localPath}`);
    }

    const file = Bun.file(localPath);
    const writer = file.writer();
    const writableStream: WritableStream = {
        // @ts-expect-error: Bun's FileSink writer is not fully compatible with the WritableStream interface, but this is good enough for testing purposes.
        getWriter: () => writer,
        close: async () => {
            await writer.end();
        },
        abort: async () => {
            await writer.end();
        },
        locked: false,
    };

    const controller = downloader.downloadToStream(writableStream, (writtenBytes) => {
        if (!json) {
            console.log(`Downloaded ${writtenBytes} bytes`);
        }
    });

    try {
        await controller.completion();
        await writer.end();
    } catch (error: unknown) {
        // When error is passed, Bun still flushes the buffer and closes the file, but marks operation as failed.
        await writer.end(error instanceof Error ? error : new Error('Unknown error'));
        throw error;
    }
}
