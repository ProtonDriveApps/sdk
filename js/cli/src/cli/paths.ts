import path from 'node:path';

import { MaybeMissingNode, MaybeNode, ProtonDriveClient, ValidationError } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';
import { ProtonDrivePublicLinkClient } from '@protontech/drive-sdk/protonDrivePublicLinkClient';

import { getName } from './node';

export enum PathType {
    Root = 'root',
    MyFiles = 'my-files',
    Devices = 'devices',
    SharedByMe = 'shared-by-me',
    SharedWithMe = 'shared-with-me',
    Trash = 'trash',
    Albums = 'albums',
    Photos = 'photos',
    PhotosSharedByMe = 'photos-shared-by-me',
    PhotosSharedWithMe = 'photos-shared-with-me',
    PhotosTrash = 'photos-trash',
}

export class Paths {
    private publicLinkSdk?: ProtonDrivePublicLinkClient;

    constructor(
        private sdk: ProtonDriveClient,
        private photosSdk: ProtonDrivePhotosClient,
        private auth: {
            isLoggedIn(): boolean;
        },
    ) {
        this.sdk = sdk;
        this.photosSdk = photosSdk;
    }

    get rootPaths(): string[] {
        return [
            PathType.MyFiles,
            PathType.Devices,
            PathType.SharedByMe,
            PathType.SharedWithMe,
            PathType.Trash,
            PathType.Albums,
            PathType.Photos,
            PathType.PhotosSharedByMe,
            PathType.PhotosSharedWithMe,
            PathType.PhotosTrash,
        ].map((path) => `/${path}`);
    }

    async getNodes(pathStrings: string[], supportedTypes?: PathType[]): Promise<MaybeNode[]> {
        const paths = this.getPaths(pathStrings, supportedTypes);
        const nodes = [];
        for (const path of paths) {
            nodes.push(await path.getNode());
        }
        return nodes;
    }

    getPaths(pathStrings: string[], supportedTypes?: PathType[]): Path[] {
        let pathType: PathType | undefined;

        if (pathStrings.length === 0) {
            throw new ValidationError('At least one path is required');
        }

        const paths = [];
        for (const pathString of pathStrings) {
            const path = this.getPath(pathString, supportedTypes);

            if (pathType === undefined) {
                pathType = path.type;
            } else if (pathType !== path.type) {
                throw new ValidationError(`Operation across Drive and Photos is not supported`);
            }

            paths.push(path);
        }

        return paths;
    }

    async getNode(pathString: string, supportedTypes?: PathType[]): Promise<MaybeNode> {
        const path = this.getPath(pathString, supportedTypes);
        return await path.getNode();
    }

    getPath(path: string, supportedTypes?: PathType[]): Path {
        const p = new Path(this.sdk, this.photosSdk, path);
        if (supportedTypes && !supportedTypes.includes(p.type)) {
            throw new ValidationError(`Path "${path}" is not supported`);
        }
        return p;
    }

    getPublicLinkPath(path: string): PublicLinkPath {
        if (!this.publicLinkSdk) {
            throw new Error('Public link SDK not initialized');
        }
        return new PublicLinkPath(this.publicLinkSdk, path);
    }

    async authPublicLinkSession(url: string, customPassword: string): Promise<ProtonDrivePublicLinkClient> {
        const { isCustomPasswordProtected } = await this.sdk.experimental.getPublicLinkInfo(url);

        if (isCustomPasswordProtected && !customPassword) {
            throw new ValidationError('Custom password is required');
        }

        const isAnonymousContext = !this.auth.isLoggedIn();
        this.publicLinkSdk = await this.sdk.experimental.authPublicLink(url, customPassword, isAnonymousContext);
        return this.publicLinkSdk;
    }
}

export class Path {
    constructor(
        private driveSdk: ProtonDriveClient,
        private photosSdk: ProtonDrivePhotosClient,
        public fullPath: string,
    ) {
        this.driveSdk = driveSdk;
        this.photosSdk = photosSdk;
        this.fullPath = fullPath;
    }

    get type() {
        if (this.fullPath === `${path.sep}`) {
            return PathType.Root;
        }
        if (this.fullPath.startsWith(`${path.sep}my-files`)) {
            return PathType.MyFiles;
        }
        if (this.fullPath.startsWith(`${path.sep}devices`)) {
            return PathType.Devices;
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
        if (this.fullPath.startsWith(`${path.sep}photos-shared-by-me`)) {
            return PathType.PhotosSharedByMe;
        }
        if (this.fullPath.startsWith(`${path.sep}photos-shared-with-me`)) {
            return PathType.PhotosSharedWithMe;
        }
        if (this.fullPath.startsWith(`${path.sep}photos-trash`)) {
            return PathType.PhotosTrash;
        }
        if (this.fullPath.startsWith(`${path.sep}photos`)) {
            return PathType.Photos;
        }
        if (this.fullPath.startsWith(`${path.sep}albums`)) {
            return PathType.Albums;
        }
        throw new ValidationError(`Path "${this.fullPath}" not supported`);
    }

    get parentPath() {
        return new Path(this.driveSdk, this.photosSdk, path.dirname(this.fullPath));
    }

    get name() {
        return path.basename(this.fullPath);
    }

    get sdk(): ProtonDriveClient | ProtonDrivePhotosClient {
        const photoPaths = [
            PathType.Albums,
            PathType.Photos,
            PathType.PhotosSharedByMe,
            PathType.PhotosSharedWithMe,
            PathType.PhotosTrash,
        ];
        if (photoPaths.includes(this.type)) {
            return this.photosSdk;
        }
        return this.driveSdk;
    }

    async getNode(): Promise<MaybeNode> {
        if (this.type === PathType.MyFiles) {
            const rootNode = await this.driveSdk.getMyFilesRootFolder();
            return this.getNodeByPath(rootNode, this.sectionPath);
        }
        if (this.type === PathType.SharedWithMe || this.type === PathType.PhotosSharedWithMe) {
            const rootNodeName = await this.getSharedWithMeRootFolder();
            return this.getNodeByPath(rootNodeName, this.sectionPathWithoutRoot);
        }
        if (this.type === PathType.Trash || this.type === PathType.PhotosTrash) {
            const parts = this.sectionPath.split(path.sep);
            if (parts.length > 1) {
                throw new ValidationError('Browsing trashed folders is not supported');
            }
            return this.getTrashedNode(parts[0]);
        }
        if (this.type === PathType.Devices) {
            const rootNodeName = await this.getDevicesRootFolder();
            return this.getNodeByPath(rootNodeName, this.sectionPathWithoutRoot);
        }
        if (this.type === PathType.Photos) {
            return this.getPhotoNodeByPath(this.sectionPath);
        }
        if (this.type === PathType.Albums) {
            return this.getAlbumNodeByPath(this.sectionPath);
        }
        throw new ValidationError('Not implemented');
    }

    async getChild(name: string) {
        const node = await this.getNode();
        return this.getNodeByName(node, name);
    }

    private get sectionPath() {
        // /my-files/foo/bar/baz -> foo/bar/baz
        return this.fullPath.split(path.sep).slice(2).join(path.sep);
    }

    private get sectionRootNodeName() {
        // /shared-with-me/foo/bar/baz -> foo
        return this.sectionPath.split(path.sep)[0];
    }

    private get sectionPathWithoutRoot() {
        // /shared-with-me/foo/bar/baz -> bar/baz
        return this.fullPath.split(path.sep).slice(3).join(path.sep);
    }

    private async getSharedWithMeRootFolder() {
        for await (const maybeNode of this.sdk.iterateSharedNodesWithMe()) {
            if (getName(maybeNode) === this.sectionRootNodeName) {
                return maybeNode;
            }
        }
        throw new ValidationError('Root node not found');
    }

    private async getTrashedNode(name: string) {
        for await (const maybeNode of this.sdk.iterateTrashedNodes()) {
            if (getName(maybeNode) === name) {
                return maybeNode;
            }
        }
        throw new ValidationError('Trashed node not found');
    }

    private async getDevicesRootFolder(): Promise<MaybeNode> {
        for await (const device of this.driveSdk.iterateDevices()) {
            const name = device.name.ok ? device.name.value : device.name.error.name;
            if (name === this.sectionRootNodeName) {
                const [maybeMissingNode] = await Array.fromAsync(this.sdk.iterateNodes([device.rootFolderUid]));
                const maybeNode = getMaybeNodeAndIgnoreMissingNode(maybeMissingNode);
                if (!maybeNode) {
                    throw new ValidationError(`Node not found`);
                }
                return maybeNode;
            }
        }
        throw new ValidationError('Device not found');
    }

    private async getNodeByPath(parentNode: MaybeNode, pathString: string) {
        let node = parentNode;
        const pathParts = pathString.split(path.sep);
        for (const part of pathParts) {
            if (part === '') {
                continue;
            }
            if (isNodeUid(part)) {
                node = await this.sdk.getNode(part);
            } else {
                node = await this.getNodeByName(node, part);
            }
        }
        return node;
    }

    private async getNodeByName(parentNode: MaybeNode, name: string) {
        for await (const maybeChild of this.driveSdk.iterateFolderChildren(parentNode)) {
            if (getName(maybeChild) === name) {
                return maybeChild;
            }
        }
        throw new ValidationError(`Node not found: ${name}`);
    }

    private async getPhotoNodeByPath(pathString: string): Promise<MaybeNode> {
        if (isNodeUid(pathString)) {
            return this.photosSdk.getNode(pathString);
        }
        return this.getPhotoByName(pathString);
    }

    private async getPhotoByName(name: string): Promise<MaybeNode> {
        const photoNodeUids = await Array.fromAsync(this.photosSdk.iterateTimeline(), (photo) => photo.nodeUid);
        for await (const maybeMissingNode of this.photosSdk.iterateNodes(photoNodeUids)) {
            const maybeNode = getMaybeNodeAndIgnoreMissingNode(maybeMissingNode);
            if (!maybeNode) {
                continue;
            }
            if (getName(maybeNode) === name) {
                return maybeNode;
            }
        }
        throw new ValidationError(`Photo not found: ${name}`);
    }

    private async getAlbumNodeByPath(pathString: string): Promise<MaybeNode> {
        if (isNodeUid(pathString)) {
            return this.photosSdk.getNode(pathString);
        }
        return this.getAlbumByName(pathString);
    }

    private async getAlbumByName(name: string): Promise<MaybeNode> {
        for await (const maybeAlbum of this.photosSdk.iterateAlbums()) {
            if (getName(maybeAlbum) === name) {
                return maybeAlbum;
            }
        }
        throw new ValidationError(`Album not found: ${name}`);
    }
}

export class PublicLinkPath {
    constructor(
        private publicLinkSdk: ProtonDrivePublicLinkClient,
        public fullPath: string,
    ) {
        this.publicLinkSdk = publicLinkSdk;
        this.fullPath = fullPath;
    }

    async getNode(): Promise<MaybeNode> {
        if (isNodeUid(this.fullPath)) {
            const nodeUid = this.fullPath;
            return this.publicLinkSdk.getNode(nodeUid);
        }

        const rootNode = await this.publicLinkSdk.getRootNode();
        return this.getNodeByPath(rootNode, this.fullPath);
    }

    async getChild(name: string) {
        const node = await this.getNode();
        return this.getNodeByName(node, name);
    }

    private async getNodeByPath(parentNode: MaybeNode, pathString: string) {
        let node = parentNode;
        const pathParts = pathString.split(path.sep);
        for (const part of pathParts) {
            if (part === '') {
                continue;
            }
            node = await this.getNodeByName(node, part);
        }
        return node;
    }

    private async getNodeByName(parentNode: MaybeNode, name: string) {
        for await (const maybeChild of this.publicLinkSdk.iterateFolderChildren(parentNode)) {
            if (getName(maybeChild) === name) {
                return maybeChild;
            }
        }
        throw new ValidationError(`Node not found: ${name}`);
    }
}

function isNodeUid(pathString: string): boolean {
    return /^([a-zA-Z0-9=_-]{88,108}|[a-zA-Z0-9_-]{22})~([a-zA-Z0-9=_-]{88,108}|[a-zA-Z0-9_-]{22})$/.test(pathString);
}

function getMaybeNodeAndIgnoreMissingNode(maybeMissingNode: MaybeMissingNode): MaybeNode | undefined {
    if (maybeMissingNode.ok) {
        return maybeMissingNode;
    }
    const erroredNode = maybeMissingNode.error;
    if ('missingUid' in erroredNode) {
        return;
    }
    return { ok: false, error: erroredNode };
}
