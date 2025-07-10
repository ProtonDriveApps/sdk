import { Command, ActionArgs } from './interface';

export class CommandBookmarkList implements Command {
    group = 'bookmark';
    name = 'list';

    async action({ sdk, options: { json } }: ActionArgs) {
        for await (const bookmark of sdk.iterateBookmarks()) {
            if (json) {
                console.log(JSON.stringify(bookmark));
            } else {
                console.log(bookmark);
            }
        }
    }
}
