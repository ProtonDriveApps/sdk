import { ParseArgsConfig } from "util";
import { NodeEntity } from "../../../sdk/src";
import { Command, ActionArgs } from './interface';
import { PathType } from './paths';
import { formatAuthor, formatDate, formatSize } from './formatters';

export class CommandFileSystemList implements Command {
    group = 'filesystem';
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

        if (path.type === PathType.Root) {
            paths.rootPaths.forEach((path) => console.log(path));
        } else if (path.type === PathType.MyFiles) {
            const parentNode = await path.getNode();
            for await (const node of sdk.iterateChildren(parentNode)) {
                this.printNode(node, { json });
            }
        } else if (path.type === PathType.SharedByMe) {
            for await (const node of sdk.iterateSharedNodes()) {
                this.printNode(node, { json });
            }
        } else if (path.type === PathType.SharedWithMe) {
            if (path.fullPath === '/shared-with-me') {
                for await (const node of sdk.iterateSharedNodesWithMe()) {
                    this.printNode(node, { json });
                }
            } else {
                const node = await path.getNode();
                for await (const child of sdk.iterateChildren(node)) {
                    this.printNode(child, { json });
                }
            }
        } else if (path.type === PathType.Trash) {
            for await (const node of sdk.iterateTrashedNodes()) {
                this.printNode(node, { json });
            }
        }
    }

    private printNode(node: NodeEntity, options: { json: boolean }) {
        if (options.json) {
            console.log(JSON.stringify(node));
            return;
        }

        const type = node.type === "file" ? "f" : "d";
        const sharedFlag = node.isShared ? 's' : ' ';
        const author = formatAuthor(node.keyAuthor);
        const created = formatDate(node.createdDate, true);
        const size = node.activeRevision?.ok ? formatSize(node.activeRevision.value.claimedSize, true) : '-';
        const id = node.uid.split('~')[1];
        const name = node.name.ok ? node.name.value : node.uid;
        console.log(`${type}${sharedFlag} ${author} ${created} ${size} ${id} ${name}`);
    }
}
