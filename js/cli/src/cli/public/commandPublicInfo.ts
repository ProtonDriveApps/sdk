import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { formatReadableJson } from '../formatters';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicInfo implements Command {
    group = 'public';
    name = 'info';
    args = ['path'];
    options: ParseArgsConfig['options'] = PUBLIC_OPTIONS;

    async action({ paths, args: [pathString], options: { json, url, customPassword } }: ActionArgs) {
        await paths.authPublicLinkSession(url, customPassword);
        const path = paths.getPublicLinkPath(pathString);
        const node = await path.getNode();

        if (json) {
            console.log(JSON.stringify(node));
        } else {
            console.log(formatReadableJson(node));
        }
    }
}
