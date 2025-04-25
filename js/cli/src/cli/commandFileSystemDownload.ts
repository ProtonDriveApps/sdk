import { Command, ActionArgs } from './interface';
import { getName } from './node';

export class CommandFileSystemDownload implements Command {
    group = 'filesystem';
    name = 'download';
    // FIXME: support download of multiple files
    args = ['path', 'localPath'];

    async action({ sdk, paths, args: [ pathString, localPath ] }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        const downloader = await sdk.getFileDownloader(node);
        const claimedSize = downloader.getClaimedSizeInBytes();
        console.log(`Downloading ${getName(node)} (${claimedSize || 'N/A'} bytes) to ${localPath}`);

        const file = Bun.file(localPath);
        const writer = file.writer();
        const writableStream: WritableStream = {
            getWriter: () => writer,
            close: () => writer.end(),
            abort: () => writer.end(),
            locked: false,
        }

        const controller = downloader.writeToStream(writableStream, (writtenBytes) => {
            console.log(`Downloaded ${writtenBytes} bytes`);
        });

        await controller.completion();
    }
}
