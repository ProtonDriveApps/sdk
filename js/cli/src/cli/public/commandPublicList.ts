
import { ParseArgsConfig } from 'util';

import { MaybeNode } from '../../../../sdk/src';
import { Command, ActionArgs } from '../interface';
import { formatAuthor, formatDate, formatSize, formatMemberRole, printIterable } from '../formatters';
import { getName, getClaimedSize, getNode } from '../node';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicList implements Command {
    group = 'public';
    name = 'list';
    args = ['path'];
    options: ParseArgsConfig['options'] = PUBLIC_OPTIONS;

    async action({ paths, args: [pathString], options: { json, url, customPassword } }: ActionArgs) {
        const client = await paths.authPublicLinkSession(url, customPassword);
        const path = paths.getPublicLinkPath(pathString);
        const folder = await path.getNode();

        await printIterable(client.iterateFolderChildren(folder), json, (node) => this.printNodeHuman(node));
    }

    private printNodeHuman(maybeNode: MaybeNode): void {
        const node = getNode(maybeNode);

        const type = node.type === 'file' ? '📄' : '🗂️';
        const permissionFlag = formatMemberRole(node.directRole);
        const author = formatAuthor(node.keyAuthor);
        const created = formatDate(node.creationTime, true);
        const claimedSize = getClaimedSize(maybeNode);
        const size = claimedSize ? formatSize(claimedSize) : '-';
        const id = node.uid.split('~')[1];
        const name = getName(maybeNode);
        console.log(`${type}${permissionFlag} ${author} ${created} ${size} ${id} ${name}`);
    }
}
