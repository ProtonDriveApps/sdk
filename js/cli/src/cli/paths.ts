import path from 'node:path';
import { ProtonDriveClient, NodeEntity, MemberRole } from "../../../sdk/src";

export enum PathType {
    Root = 'root',
    MyFiles = 'my-files',
    SharedByMe = 'shared-by-me',
    SharedWithMe = 'shared-with-me',
    Trash = 'trash',
}

export class Paths {
    constructor(private sdk: ProtonDriveClient) {
        this.sdk = sdk;
    }

    get rootPaths(): string[] {
        return [
            PathType.MyFiles,
            PathType.SharedByMe,
            PathType.SharedWithMe,
            PathType.Trash,
        ].map((path) => `/${path}`);
    }

    getPath(path: string): Path {
        return new Path(this.sdk, path);
    }
}

export class Path {
    constructor(private sdk: ProtonDriveClient, public fullPath: string) {
        this.sdk = sdk;
        this.fullPath = fullPath;
    }

    get type() {
        if (this.fullPath === `${path.sep}`) {
            return PathType.Root;
        }
        if (this.fullPath.startsWith(`${path.sep}my-files`)) {
            return PathType.MyFiles;
        }
        if (this.fullPath.startsWith(`${path.sep}shared-by-me`)) {
            return PathType.SharedByMe;
        }
        if (this.fullPath.startsWith(`${path.sep}shared-with-me`)) {
            return PathType.SharedWithMe;
        }
        if (this.fullPath.startsWith(`${path.sep}trash`)) {
            return PathType.Trash;
        }
        throw new Error('Path not supported');
    }

    get parentPath() {
        return new Path(this.sdk, path.dirname(this.fullPath));
    }

    get name() {
        return path.basename(this.fullPath);
    }

    async getNode() {
        if (this.type === PathType.MyFiles) {
            const rootNode = await this.sdk.getMyFilesRootFolder();
            return this.getNodeByPath(rootNode, this.sectionPath);
        }
        throw new Error('Not implemented');
    }

    private get sectionPath() {
        // /my-files/foo/bar -> foo/bar
        return this.fullPath.split(path.sep).slice(2).join(path.sep);
    }

    private async getNodeByPath(parentNode: NodeEntity, pathString: string) {
        let node = parentNode;
        const pathParts = pathString.split(path.sep);
        for (const part of pathParts) {
            if (part === "") {
                continue;
            }
            node = await this.getNodeByName(node, part);
        }
        return node;
    }

    private async getNodeByName(parentNode: NodeEntity, name: string) {
        for await (const child of this.sdk.iterateChildren(parentNode)) {
            if (child.name.ok && child.name.value === name) {
                return child;
            }
        }
        throw new Error(`Node not found: ${name}`);
    }
}
