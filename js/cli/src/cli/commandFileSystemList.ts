import { ParseArgsConfig } from "util";

import { MaybeNode, MemberRole } from "../../../sdk/src";
import { Command, ActionArgs } from './interface';
import { PathType } from './paths';
import { formatAuthor, formatDate, formatSize } from './formatters';
import { getName, getClaimedSize, getNode } from "./node";

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
            for await (const node of sdk.iterateFolderChildren(parentNode)) {
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
                for await (const child of sdk.iterateFolderChildren(node)) {
                    this.printNode(child, { json });
                }
            }
        } else if (path.type === PathType.Trash) {
            for await (const node of sdk.iterateTrashedNodes()) {
                this.printNode(node, { json });
            }
        }
    }

    private printNode(maybeNode: MaybeNode, options: { json: boolean }) {
        if (options.json) {
            console.log(JSON.stringify(maybeNode));
            return;
        }
        const node = getNode(maybeNode);

        const type = node.type === "file" ? "📄" : "🗂️";
        const sharedFlag = node.isShared
            ? '🔗'
            : '  '; // Two spaces to align with the shared icon.
        const permissionFlag = getPermissionFlag(node.directMemberRole);
        const author = formatAuthor(node.keyAuthor);
        const created = formatDate(node.createdDate, true);
        const claimedSize = getClaimedSize(maybeNode)
        const size = claimedSize ? formatSize(claimedSize) : '-';
        const id = node.uid.split('~')[1];
        const name = getName(maybeNode);
        console.log(`${type}${sharedFlag}${permissionFlag} ${author} ${created} ${size} ${id} ${name}`);
    }
}

function getPermissionFlag(memberRole: MemberRole): string {
    switch (memberRole) {
        case MemberRole.Inherited:
            return '  '; // Two spaces to align with icon.
        case MemberRole.Viewer:
            return '👁 '; // Extra space due to how terminal render this.
        case MemberRole.Editor:
            return '📝';
        case MemberRole.Admin:
            return '👑';
    }
}
