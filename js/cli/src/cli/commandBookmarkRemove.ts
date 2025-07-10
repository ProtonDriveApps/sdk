import { Command, ActionArgs } from './interface';

export class CommandBookmarkRemove implements Command {
    group = 'bookmark';
    name = 'remove';
    args = ['bookmarkUid'];

    async action({ sdk, args: [bookmarkUid] }: ActionArgs) {
        await sdk.removeBookmark(bookmarkUid);
        console.log(`Deleted bookmark: ${bookmarkUid}`);
    }
}
