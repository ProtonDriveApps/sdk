import { ParseArgsConfig } from 'util';

import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicRename implements Command {
    group = 'public';
    name = 'rename';
    isPublicAction = true;
    args = ['path', 'newName'];
    options: ParseArgsConfig['options'] = PUBLIC_OPTIONS;

    async action({ paths, args: [pathString, newName], options: { json, url, 'custom-password': customPassword } }: ActionArgs) {
        const client = await paths.authPublicLinkSession(url, customPassword);
        const nodePath = paths.getPublicLinkPath(pathString);
        const node = await nodePath.getNode();
        const renamedNode = await client.renameNode(node, newName);

        printObject(renamedNode, json);
    }
}
