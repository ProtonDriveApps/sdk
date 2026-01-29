import { ParseArgsConfig } from 'util';
import { Command, ActionArgs } from '../interface';
import { PUBLIC_OPTIONS } from '../public/base';

export class CommandBookmarkCreate implements Command {
    group = 'bookmark';
    name = 'create';
    options: ParseArgsConfig['options'] = PUBLIC_OPTIONS;

    async action({ sdk, options: { json, url, 'custom-password': customPassword } }: ActionArgs) {
        await sdk.createBookmark(url, customPassword);
        if (!json) {
            console.log(`Created bookmark: ${url}`);
        }
    }
}
