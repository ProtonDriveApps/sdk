
import { ParseArgsConfig } from 'util';

import { MaybeNode } from '../../../../sdk/src';
import { Command, ActionArgs } from '../interface';
import { formatAuthor, formatDate, formatSize, formatMemberRole } from '../formatters';
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

        for await (const node of client.iterateFolderChildren(folder)) {
            this.printNode(node, { json });
        }
    }

    private printNode(maybeNode: MaybeNode, options: { json: boolean }) {
        if (options.json) {
            console.log(JSON.stringify(maybeNode));
            return;
        }
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
