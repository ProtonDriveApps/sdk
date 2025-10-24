import { ParseArgsConfig } from 'util';

import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicCreateFolder implements Command {
    group = 'public';
    name = 'create-folder';
    args = ['path', 'name'];
    options: ParseArgsConfig['options'] = PUBLIC_OPTIONS;

    async action({ paths, args: [pathString, name], options: { json, url, 'custom-password': customPassword } }: ActionArgs) {
        const client = await paths.authPublicLinkSession(url, customPassword);
        const nodePath = paths.getPublicLinkPath(pathString);
        const parent = await nodePath.getNode();

        const folder = await client.createFolder(parent, name, new Date());

        printObject(folder, json);
    }
}
