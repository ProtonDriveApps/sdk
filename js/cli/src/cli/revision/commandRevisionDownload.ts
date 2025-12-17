import { Command, ActionArgs } from '../interface';
import { download } from '../downloader';

export class CommandRevisionDownload implements Command {
    group = 'revision';
    name = 'download';
    args = ['revisionUid', 'localPath'];

    async action({ sdk, args: [revisionUid, localPath], options: { json } }: ActionArgs) {
        const downloader = await sdk.getFileRevisionDownloader(revisionUid);

        await download({
            downloader,
            downloadingName: `revision`,
            localPath,
            json,
        });
    }
}
