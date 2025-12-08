import { PrivateKey } from '../../crypto';
import { DecryptionError } from '../../errors';
import { NodeType } from '../../interface';
import { drivePaths } from '../apiService';
import { NodeAPIServiceBase, linkToEncryptedNode, linkToEncryptedNodeBaseMetadata } from '../nodes/apiService';
import { NodesCacheBase, serialiseNode, deserialiseNode } from '../nodes/cache';
import { NodesCryptoService } from '../nodes/cryptoService';
import { DecryptedNodeKeys } from '../nodes/interface';
import { NodesAccessBase, parseNode as parseNodeBase } from '../nodes/nodesAccess';
import { NodesManagementBase } from '../nodes/nodesManagement';
import { makeNodeUid } from '../uids';
import { EncryptedPhotoNode, DecryptedPhotoNode, DecryptedUnparsedPhotoNode } from './interface';

type PostLoadLinksMetadataRequest = Extract<
    drivePaths['/drive/photos/volumes/{volumeID}/links']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostLoadLinksMetadataResponse =
    drivePaths['/drive/photos/volumes/{volumeID}/links']['post']['responses']['200']['content']['application/json'];

export class PhotosNodesAPIService extends NodeAPIServiceBase<
    EncryptedPhotoNode,
    PostLoadLinksMetadataResponse['Links'][0]
> {
    protected async fetchNodeMetadata(volumeId: string, linkIds: string[], signal?: AbortSignal) {
        const response = await this.apiService.post<PostLoadLinksMetadataRequest, PostLoadLinksMetadataResponse>(
            `drive/photos/volumes/${volumeId}/links`,
            {
                LinkIDs: linkIds,
            },
            signal,
        );
        return response.Links;
    }

    protected linkToEncryptedNode(
        volumeId: string,
        link: PostLoadLinksMetadataResponse['Links'][0],
        isOwnVolumeId: boolean,
    ): EncryptedPhotoNode {
        const { baseNodeMetadata, baseCryptoNodeMetadata } = linkToEncryptedNodeBaseMetadata(
            this.logger,
            volumeId,
            link,
            isOwnVolumeId,
        );

        if (link.Link.Type === 2 && link.Photo && link.Photo.ActiveRevision) {
            const node = linkToEncryptedNode(
                this.logger,
                volumeId,
                { ...link, File: link.Photo, Folder: null },
                isOwnVolumeId,
            );
            return {
                ...node,
                type: NodeType.Photo,
                photo: {
                    captureTime: new Date(link.Photo.CaptureTime * 1000),
                    mainPhotoNodeUid: link.Photo.MainPhotoLinkID
                        ? makeNodeUid(volumeId, link.Photo.MainPhotoLinkID)
                        : undefined,
                    relatedPhotoNodeUids: link.Photo.RelatedPhotosLinkIDs.map((relatedLinkId) =>
                        makeNodeUid(volumeId, relatedLinkId),
                    ),
                    contentHash: link.Photo.ContentHash || undefined,
                    tags: link.Photo.Tags,
                    albums: link.Photo.Albums.map((album) => ({
                        nodeUid: makeNodeUid(volumeId, album.AlbumLinkID),
                        additionTime: new Date(album.AddedTime * 1000),
                        nameHash: album.Hash,
                        contentHash: album.ContentHash,
                    })),
                },
            };
        }

        if (link.Link.Type === 3) {
            return {
                ...baseNodeMetadata,
                encryptedCrypto: {
                    ...baseCryptoNodeMetadata,
                },
            };
        }

        const baseLink = {
            Link: link.Link,
            Membership: link.Membership,
            Sharing: link.Sharing,
            // @ts-expect-error The photo link can have a folder type, but not always. If not set, it will use other paths.
            Folder: link.Folder,
            File: null, // The photo link metadata never returns a file type.
        };
        return linkToEncryptedNode(this.logger, volumeId, baseLink, isOwnVolumeId);
    }
}

export class PhotosNodesCache extends NodesCacheBase<DecryptedPhotoNode> {
    serialiseNode(node: DecryptedPhotoNode): string {
        return serialiseNode(node);
    }

    // TODO: use better deserialisation with validation
    deserialiseNode(nodeData: string): DecryptedPhotoNode {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const node = deserialiseNode(nodeData) as any;

        if (
            !node ||
            typeof node !== 'object' ||
            (typeof node.photo !== 'object' && node.photo !== undefined) ||
            (typeof node.photo?.captureTime !== 'string' && node.folder?.captureTime !== undefined) ||
            (typeof node.photo?.albums !== 'object' && node.photo?.albums !== undefined)
        ) {
            throw new Error(`Invalid node data: ${nodeData}`);
        }

        return {
            ...node,
            photo: !node.photo
                ? undefined
                : {
                      captureTime: new Date(node.photo.captureTime),
                      mainPhotoNodeUid: node.photo.mainPhotoNodeUid,
                      relatedPhotoNodeUids: node.photo.relatedPhotoNodeUids,
                      contentHash: node.photo.contentHash,
                      tags: node.photo.tags,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      albums: node.photo.albums?.map((album: any) => ({
                          nodeUid: album.nodeUid,
                          additionTime: new Date(album.additionTime),
                      })),
                  },
        } as DecryptedPhotoNode;
    }
}

export class PhotosNodesAccess extends NodesAccessBase<EncryptedPhotoNode, DecryptedPhotoNode, PhotosNodesCryptoService> {
    async getParentKeys(
        node: Pick<EncryptedPhotoNode, 'uid' | 'parentUid' | 'shareId' | 'photo'>,
    ): Promise<Pick<DecryptedNodeKeys, 'key' | 'hashKey'>> {
        if (node.parentUid || node.shareId) {
            return super.getParentKeys(node);
        }

        if (node.photo?.albums.length) {
            // If photo is in multiple albums, we just need to get keys for one of them.
            // Prefer to find a cached key first.
            for (const album of node.photo.albums) {
                try {
                    const keys = await this.cryptoCache.getNodeKeys(album.nodeUid);
                    return {
                        key: keys.key,
                        hashKey: keys.hashKey,
                    };
                } catch {
                    // We ignore missing or invalid keys here, its just optimization.
                    // If it cannot be fixed, it will bubble up later when requesting
                    // the node keys for one of the albums.
                }
            }

            const albumNodeUid = node.photo.albums[0].nodeUid;
            return this.getNodeKeys(albumNodeUid);
        }

        // This is bug that should not happen.
        // API cannot provide node without parent or share or album.
        throw new Error('Node has neither parent node nor share nor album');
    }

    protected getDegradedUndecryptableNode(
        encryptedNode: EncryptedPhotoNode,
        error: DecryptionError,
    ): DecryptedPhotoNode {
        return this.getDegradedUndecryptableNodeBase(encryptedNode, error);
    }

    protected parseNode(unparsedNode: DecryptedUnparsedPhotoNode): DecryptedPhotoNode {
        if (unparsedNode.type === NodeType.Photo) {
            const node = parseNodeBase(this.logger, {
                ...unparsedNode,
                type: NodeType.File,
            });
            return {
                ...node,
                photo: unparsedNode.photo,
            };
        }

        return parseNodeBase(this.logger, unparsedNode);
    }
}

export class PhotosNodesCryptoService extends NodesCryptoService {
    async decryptNode(
        encryptedNode: EncryptedPhotoNode,
        parentKey: PrivateKey,
    ): Promise<{ node: DecryptedUnparsedPhotoNode; keys?: DecryptedNodeKeys }> {
        const decryptedNode = await super.decryptNode(encryptedNode, parentKey);

        if (decryptedNode.node.type === NodeType.Photo) {
            return {
                node: {
                    ...decryptedNode.node,
                    photo: encryptedNode.photo,
                },
            };
        }

        return decryptedNode;
    }
}

export class PhotosNodesManagement extends NodesManagementBase<
    EncryptedPhotoNode,
    DecryptedPhotoNode,
    PhotosNodesCryptoService
> {
    protected generateNodeFolder(
        nodeUid: string,
        parentNodeUid: string,
        name: string,
        encryptedCrypto: {
            hash: string;
            encryptedName: string;
            signatureEmail: string | null;
        },
    ): DecryptedPhotoNode {
        return this.generateNodeFolderBase(nodeUid, parentNodeUid, name, encryptedCrypto);
    }
}
