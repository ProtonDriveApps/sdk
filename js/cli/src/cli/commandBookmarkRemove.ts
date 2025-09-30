import { Command, ActionArgs } from './interface';

export class CommandBookmarkRemove implements Command {
    group = 'bookmark';
    name = 'remove';
    args = ['bookmarkUid'];

    async action({ sdk, args: [bookmarkUid], options: { json } }: ActionArgs) {
        await sdk.removeBookmark(bookmarkUid);
        if (!json) {
            console.log(`Deleted bookmark: ${bookmarkUid}`);
        }
    }
}
