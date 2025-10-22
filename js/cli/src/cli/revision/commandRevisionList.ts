import { NodeType, Revision } from '../../../../sdk/src';
import { Command, ActionArgs } from '../interface';
import { formatAuthor, formatDate, formatSize, printIterable } from '../formatters';
import { getNode } from '../node';

export class CommandRevisionList implements Command {
    group = 'revision';
    name = 'list';
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const maybeNode = await path.getNode();

        if (getNode(maybeNode).type === NodeType.Folder) {
            throw new Error('Cannot list revisions of a folder');
        }
        await printIterable(sdk.iterateRevisions(maybeNode), json, (revision) => this.printRevisionHuman(revision));
    }

    private printRevisionHuman(revision: Revision): void {
        const author = formatAuthor(revision.contentAuthor);
        const created = formatDate(revision.creationTime, true);
        const size = formatSize(revision.claimedSize, true);
        console.log(`${author} ${created} ${size} ${revision.uid}`);
    }
}
