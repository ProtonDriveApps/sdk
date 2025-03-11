import { ParseArgsConfig } from "util";
import { NodeType, Revision } from "../../../sdk/src";
import { Command, ActionArgs } from './interface';
import { formatAuthor, formatDate, formatSize } from './formatters';

export class CommandRevisionList implements Command {
    group = 'revision';
    name = 'list';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        humanReadable: {
            type: 'boolean',
            short: 'h',
            default: false,
        },
    };

    async action({ sdk, paths, args: [ pathString ], options: { humanReadable } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        if (node.type === NodeType.Folder) {
            throw new Error('Cannot list revisions of a folder');
        }
        for await (const revision of sdk.iterateRevisions(node)) {
            this.printRevision(revision, { humanReadable });
        }
    }

    private printRevision(revision: Revision, options: { humanReadable: boolean }) {
        const author = formatAuthor(revision.contentAuthor);
        const created = formatDate(revision.createdDate, options.humanReadable);
        const size = formatSize(revision.claimedSize, options.humanReadable);
        console.log(`${author} ${created} ${size} ${revision.uid}`);
    }
}
