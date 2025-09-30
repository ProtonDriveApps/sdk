import { printIterable } from './formatters';
import { Command, ActionArgs } from './interface';

export class CommandBookmarkList implements Command {
    group = 'bookmark';
    name = 'list';

    async action({ sdk, options: { json } }: ActionArgs) {
        await printIterable(sdk.iterateBookmarks(), json);
    }
}
