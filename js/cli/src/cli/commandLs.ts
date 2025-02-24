import { ParseArgsConfig } from "util";
import { NodeEntity, MemberRole, NodeType, Revision, Author } from "../../../sdk/src";
import { Command, ActionArgs } from './interface';
import { PathType } from './paths';

const MEMBER_ROLE_TO_FLAG = {
    [MemberRole.Viewer]: 'v',
    [MemberRole.Editor]: 'e',
    [MemberRole.Admin]: 'a',
    [MemberRole.Inherited]: 'i',
}

export class CommandLs implements Command {
    name = 'ls';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        long: {
            type: 'boolean',
            short: 'l',
            default: false,
        },
        revisions: {
            type: 'boolean',
            default: false,
        }
    };

    async action({ sdk, paths, args: [ pathString ], options: { long, revisions } }: ActionArgs) {
        const path = paths.getPath(pathString);

        if (path.type === PathType.Root) {
            paths.rootPaths.forEach((path) => console.log(path));
        } else if (path.type === PathType.MyFiles) {
            const node = await path.getNode();

            if (revisions) {
                if (node.type === NodeType.Folder) {
                    throw new Error('Cannot list revisions of a folder');
                }
                for await (const revision of sdk.iterateRevisions(node)) {
                    this.printRevision(revision);
                }
            } else {
                for await (const child of sdk.iterateChildren(node)) {
                    this.printNode(child, { long });
                }
            }
        } else if (path.type === PathType.SharedByMe) {
            for await (const node of sdk.iterateSharedNodes()) {
                this.printNode(node, { long });
            }
        } else if (path.type === PathType.SharedWithMe) {
            for await (const node of sdk.iterateSharedNodesWithMe()) {
                this.printNode(node, { long });
            }
        } else if (path.type === PathType.Trash) {
            for await (const node of sdk.iterateTrashedNodes()) {
                this.printNode(node, { long });
            }
        }
    }

    private printNode(node: NodeEntity, options: { long: boolean }) {
        const type = node.type === "file" ? "f" : "d";
        const sharedFlag = node.isShared ? 's' : ' ';
        const permissionFlag = MEMBER_ROLE_TO_FLAG[node.directMemberRole];
        const author = this.formatAuthor(node.keyAuthor);
        const created = this.formatDate(node.createdDate);
        const id = node.uid.split(';')[1].split(':')[1];
        const name = node.name.ok ? node.name.value : node.uid;
        if (options.long) {
            console.log(`${type}${sharedFlag}${permissionFlag} ${author} ${created} ${id} ${name}`);
        } else {
            console.log(`${name}`);
        }
    }

    private printRevision(revision: Revision) {
        const author = this.formatAuthor(revision.author);
        const created = this.formatDate(revision.createdDate);
        const id = revision.uid.split(';')[2].split(':')[1];
        console.log(`${author} ${created} ${revision.claimedSize || "N/A"} ${id}`);
    }

    private formatAuthor(author: Author) {
        return author.ok ? author.value : `(${author.error.claimedAuthor})`;
    }

    private formatDate(date: Date) {
        return `${date.toDateString().slice(4)} ${date.toTimeString().slice(0, 5)}`;
    }
}
