import { Command, ActionArgs } from '../interface';

export class CommandRevisionDownload implements Command {
    group = 'revision';
    name = 'download';
    args = ['revisionUid', 'localPath'];

    async action({ sdk, args: [revisionUid, localPath], options: { json } }: ActionArgs) {
        const downloader = await sdk.getFileRevisionDownloader(revisionUid);
        const claimedSize = downloader.getClaimedSizeInBytes();

        if (!json) {
            console.log(`Downloading revision (${claimedSize || 'N/A'} bytes) to ${localPath}`);
        }

        const file = Bun.file(localPath);
        const writer = file.writer();
        const writableStream: WritableStream = {
            getWriter: () => writer,
            close: () => writer.end(),
            abort: () => writer.end(),
            locked: false,
        };

        const controller = downloader.downloadToStream(writableStream, (writtenBytes) => {
            if (!json) {
                console.log(`Downloaded ${writtenBytes} bytes`);
            }
        });

        await controller.completion();
    }
}
