import { ParseArgsConfig } from 'util';

import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicDelete implements Command {
    group = 'public';
    name = 'delete';
    isPublicAction = true;
    args = ['nodeUid'];
    options: ParseArgsConfig['options'] = PUBLIC_OPTIONS;

    async action({ paths, args: [nodeUid], options: { json, url, 'custom-password': customPassword } }: ActionArgs) {
        const client = await paths.authPublicLinkSession(url, customPassword);
        const nodePath = paths.getPublicLinkPath(nodeUid);
        const node = await nodePath.getNode();

        await printIterable(client.deleteNodes([node]), json, (result) =>
            console.log(result.ok ? `✅ Deleted ${result.uid}` : `❌ Failed to delete ${result.uid}: ${result.error}`),
            );
    }
}
