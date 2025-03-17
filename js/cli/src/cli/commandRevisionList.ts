import { ParseArgsConfig } from "util";
import { NodeType, Revision } from "../../../sdk/src";
import { Command, ActionArgs } from './interface';
import { formatAuthor, formatDate, formatSize } from './formatters';

export class CommandRevisionList implements Command {
    group = 'revision';
    name = 'list';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({ sdk, paths, args: [ pathString ], options: { json } }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();

        if (node.type === NodeType.Folder) {
            throw new Error('Cannot list revisions of a folder');
        }
        for await (const revision of sdk.iterateRevisions(node)) {
            this.printRevision(revision, { json });
        }
    }

    private printRevision(revision: Revision, options: { json: boolean }) {
        if (options.json) {
            console.log(JSON.stringify(revision));
            return;
        }

        const author = formatAuthor(revision.contentAuthor);
        const created = formatDate(revision.createdDate, true);
        const size = formatSize(revision.claimedSize, true);
        console.log(`${author} ${created} ${size} ${revision.uid}`);
    }
}
