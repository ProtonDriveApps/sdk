import { c } from 'ttag';

import { ValidationError } from '../../errors';
import { NodeResultWithError } from '../../interface';
import { APICodeError, DriveAPIService, drivePaths, InvalidRequirementsAPIError, isCodeOk } from '../apiService';
import { batch } from '../batch';
import { EncryptedRootShare, EncryptedShareCrypto, ShareType } from '../shares/interface';
import { makeNodeUid, splitNodeUid } from '../uids';
import { MissingRelatedPhotosError } from './errors';
import { AddToAlbumEncryptedPhotoPayload, AlbumItem } from './interface';

type GetPhotoShareResponse =
    drivePaths['/drive/v2/shares/photos']['get']['responses']['200']['content']['application/json'];

type PostCreateVolumeRequest = Extract<
    drivePaths['/drive/photos/volumes']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCreateVolumeResponse =
    drivePaths['/drive/photos/volumes']['post']['responses']['200']['content']['application/json'];

type GetTimelineResponse =
    drivePaths['/drive/volumes/{volumeID}/photos']['get']['responses']['200']['content']['application/json'];

type GetAlbumsResponse =
    drivePaths['/drive/photos/volumes/{volumeID}/albums']['get']['responses']['200']['content']['application/json'];

type GetAlbumChildrenResponse =
    drivePaths['/drive/photos/volumes/{volumeID}/albums/{linkID}/children']['get']['responses']['200']['content']['application/json'];

type PostCreateAlbumRequest = Extract<
    drivePaths['/drive/photos/volumes/{volumeID}/albums']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCreateAlbumResponse =
    drivePaths['/drive/photos/volumes/{volumeID}/albums']['post']['responses']['200']['content']['application/json'];

type PutUpdateAlbumRequest = Extract<
    drivePaths['/drive/photos/volumes/{volumeID}/albums/{linkID}']['put']['requestBody'],
    { content: object }
>['content']['application/json'];

type PostPhotoDuplicateRequest = Extract<
    drivePaths['/drive/volumes/{volumeID}/photos/duplicates']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostPhotoDuplicateResponse =
    drivePaths['/drive/volumes/{volumeID}/photos/duplicates']['post']['responses']['200']['content']['application/json'];

type PostAddPhotosToAlbumRequest = Extract<
    drivePaths['/drive/photos/volumes/{volumeID}/albums/{linkID}/add-multiple']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostAddPhotosToAlbumResponse =
    drivePaths['/drive/photos/volumes/{volumeID}/albums/{linkID}/add-multiple']['post']['responses']['200']['content']['application/json'];

type PostCopyLinkRequest = Extract<
    drivePaths['/drive/volumes/{volumeID}/links/{linkID}/copy']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCopyLinkResponse =
    drivePaths['/drive/volumes/{volumeID}/links/{linkID}/copy']['post']['responses']['200']['content']['application/json'];

type PostRemovePhotosFromAlbumRequest = Extract<
    drivePaths['/drive/photos/volumes/{volumeID}/albums/{linkID}/remove-multiple']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostRemovePhotosFromAlbumResponse =
    drivePaths['/drive/photos/volumes/{volumeID}/albums/{linkID}/remove-multiple']['post']['responses']['200']['content']['application/json'];

const ALBUM_CONTAINS_PHOTOS_NOT_IN_TIMELINE_ERROR_CODE = 200302;

/**
 * Provides API communication for fetching and manipulating photos and albums
 * metadata.
 *
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class PhotosAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async getPhotoShare(): Promise<EncryptedRootShare> {
        const response = await this.apiService.get<GetPhotoShareResponse>('drive/v2/shares/photos');

        return {
            volumeId: response.Volume.VolumeID,
            shareId: response.Share.ShareID,
            rootNodeId: response.Link.Link.LinkID,
            creatorEmail: response.Share.CreatorEmail,
            encryptedCrypto: {
                armoredKey: response.Share.Key,
                armoredPassphrase: response.Share.Passphrase,
                armoredPassphraseSignature: response.Share.PassphraseSignature,
            },
            addressId: response.Share.AddressID,
            type: ShareType.Photo,
        };
    }

    async createPhotoVolume(
        share: {
            addressId: string;
            addressKeyId: string;
        } & EncryptedShareCrypto,
        node: {
            encryptedName: string;
            armoredKey: string;
            armoredPassphrase: string;
            armoredPassphraseSignature: string;
            armoredHashKey: string;
        },
    ): Promise<{ volumeId: string; shareId: string; rootNodeId: string }> {
        const response = await this.apiService.post<PostCreateVolumeRequest, PostCreateVolumeResponse>(
            'drive/photos/volumes',
            {
                Share: {
                    AddressID: share.addressId,
                    AddressKeyID: share.addressKeyId,
                    Key: share.armoredKey,
                    Passphrase: share.armoredPassphrase,
                    PassphraseSignature: share.armoredPassphraseSignature,
                },
                Link: {
                    Name: node.encryptedName,
                    NodeKey: node.armoredKey,
                    NodePassphrase: node.armoredPassphrase,
                    NodePassphraseSignature: node.armoredPassphraseSignature,
                    NodeHashKey: node.armoredHashKey,
                },
            },
        );
        return {
            volumeId: response.Volume.VolumeID,
            shareId: response.Volume.Share.ShareID,
            rootNodeId: response.Volume.Share.LinkID,
        };
    }

    async *iterateTimeline(
        volumeId: string,
        signal?: AbortSignal,
    ): AsyncGenerator<{
        nodeUid: string;
        captureTime: Date;
        tags: number[];
    }> {
        let anchor = '';
        while (true) {
            const response = await this.apiService.get<GetTimelineResponse>(
                `drive/volumes/${volumeId}/photos?${anchor ? `PreviousPageLastLinkID=${anchor}` : ''}`,
                signal,
            );
            for (const photo of response.Photos) {
                const nodeUid = makeNodeUid(volumeId, photo.LinkID);
                yield {
                    nodeUid,
                    captureTime: new Date(photo.CaptureTime * 1000),
                    tags: photo.Tags,
                };
            }

            if (!response.Photos.length) {
                break;
            }
            anchor = response.Photos[response.Photos.length - 1].LinkID;
        }
    }

    async *iterateAlbums(
        volumeId: string,
        signal?: AbortSignal,
    ): AsyncGenerator<{
        albumUid: string;
        coverNodeUid?: string;
        photoCount: number;
        lastActivityTime: Date;
    }> {
        let anchor = '';
        while (true) {
            const response = await this.apiService.get<GetAlbumsResponse>(
                `drive/photos/volumes/${volumeId}/albums?${anchor ? `AnchorID=${anchor}` : ''}`,
                signal,
            );
            for (const album of response.Albums) {
                const albumUid = makeNodeUid(volumeId, album.LinkID);
                yield {
                    albumUid,
                    coverNodeUid: album.CoverLinkID ? makeNodeUid(volumeId, album.CoverLinkID) : undefined,
                    photoCount: album.PhotoCount,
                    lastActivityTime: new Date(album.LastActivityTime * 1000),
                };
            }

            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async *iterateAlbumChildren(albumNodeUid: string, signal?: AbortSignal): AsyncGenerator<AlbumItem> {
        const { volumeId, nodeId: linkId } = splitNodeUid(albumNodeUid);
        let anchor = '';
        while (true) {
            const response = await this.apiService.get<GetAlbumChildrenResponse>(
                `drive/photos/volumes/${volumeId}/albums/${linkId}/children?Sort=Captured&Desc=1${anchor ? `&AnchorID=${anchor}` : ''}`,
                signal,
            );
            for (const photo of response.Photos) {
                yield {
                    nodeUid: makeNodeUid(volumeId, photo.LinkID),
                    captureTime: new Date(photo.CaptureTime * 1000),
                };
            }

            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async checkPhotoDuplicates(
        volumeId: string,
        nameHashes: string[],
        signal?: AbortSignal,
    ): Promise<
        {
            nameHash: string;
            contentHash: string;
            nodeUid: string;
            clientUid?: string;
        }[]
    > {
        const response = await this.apiService.post<PostPhotoDuplicateRequest, PostPhotoDuplicateResponse>(
            `drive/volumes/${volumeId}/photos/duplicates`,
            {
                NameHashes: nameHashes,
            },
            signal,
        );

        return response.DuplicateHashes.map((duplicate) => {
            if (!duplicate.Hash || !duplicate.ContentHash || duplicate.LinkState !== 1 /* Active */) {
                return undefined;
            }
            return {
                nameHash: duplicate.Hash,
                contentHash: duplicate.ContentHash,
                nodeUid: makeNodeUid(volumeId, duplicate.LinkID),
                clientUid: duplicate.ClientUID || undefined,
            };
        }).filter((duplicate) => duplicate !== undefined);
    }

    async createAlbum(
        parentNodeUid: string,
        album: {
            encryptedName: string;
            hash: string;
            armoredKey: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature: string;
            signatureEmail: string;
            armoredHashKey: string;
        },
    ): Promise<string> {
        const { volumeId } = splitNodeUid(parentNodeUid);
        const response = await this.apiService.post<PostCreateAlbumRequest, PostCreateAlbumResponse>(
            `drive/photos/volumes/${volumeId}/albums`,
            {
                Locked: false,
                Link: {
                    Name: album.encryptedName,
                    Hash: album.hash,
                    NodeKey: album.armoredKey,
                    NodePassphrase: album.armoredNodePassphrase,
                    NodePassphraseSignature: album.armoredNodePassphraseSignature,
                    SignatureEmail: album.signatureEmail,
                    NodeHashKey: album.armoredHashKey,
                    XAttr: null,
                },
            },
        );

        return makeNodeUid(volumeId, response.Album.Link.LinkID);
    }

    async updateAlbum(
        albumNodeUid: string,
        coverPhotoNodeUid?: string,
        updatedName?: {
            encryptedName: string;
            hash: string;
            originalHash: string;
            nameSignatureEmail: string;
        },
    ): Promise<void> {
        const { volumeId, nodeId: linkId } = splitNodeUid(albumNodeUid);
        const coverLinkId = coverPhotoNodeUid ? splitNodeUid(coverPhotoNodeUid).nodeId : undefined;
        await this.apiService.put<PutUpdateAlbumRequest, void>(`drive/photos/volumes/${volumeId}/albums/${linkId}`, {
            CoverLinkID: coverLinkId,
            Link: updatedName
                ? {
                      Name: updatedName.encryptedName,
                      Hash: updatedName.hash,
                      OriginalHash: updatedName.originalHash,
                      NameSignatureEmail: updatedName.nameSignatureEmail,
                  }
                : null,
        });
    }

    async deleteAlbum(albumNodeUid: string, options: { force?: boolean } = {}): Promise<void> {
        const { volumeId, nodeId: linkId } = splitNodeUid(albumNodeUid);
        try {
            await this.apiService.delete(
                `drive/photos/volumes/${volumeId}/albums/${linkId}?DeleteAlbumPhotos=${options.force ? 1 : 0}`,
            );
        } catch (error) {
            if (error instanceof APICodeError && error.code === ALBUM_CONTAINS_PHOTOS_NOT_IN_TIMELINE_ERROR_CODE) {
                throw new ValidationError(c('Error').t`Album contains photos not in timeline`);
            }
            throw error;
        }
    }

    /**
     * Add photos from the same volume to an album.
     *
     * To add photos from different volumes, use the {@link copyPhotoToAlbum} method.
     *
     * In the future, these two methods will be merged into a single one.
     */
    async *addPhotosToAlbum(
        albumNodeUid: string,
        photoPayloads: AddToAlbumEncryptedPhotoPayload[],
        signal?: AbortSignal,
    ): AsyncGenerator<NodeResultWithError> {
        const { volumeId, nodeId: albumLinkId } = splitNodeUid(albumNodeUid);

        const allPhotoPayloads = photoPayloads.flatMap((photoPayload) => [
            photoPayload,
            ...(photoPayload.relatedPhotos || []),
        ]);
        const allPhotoData = allPhotoPayloads.map((photoPayload) => {
            const { nodeId } = splitNodeUid(photoPayload.nodeUid);
            return {
                LinkID: nodeId,
                Hash: photoPayload.nameHash,
                Name: photoPayload.encryptedName,
                NameSignatureEmail: photoPayload.nameSignatureEmail,
                NodePassphrase: photoPayload.nodePassphrase,
                ContentHash: photoPayload.contentHash,
            };
        });

        const response = await this.apiService.post<PostAddPhotosToAlbumRequest, PostAddPhotosToAlbumResponse>(
            `drive/photos/volumes/${volumeId}/albums/${albumLinkId}/add-multiple`,
            {
                AlbumData: allPhotoData,
            },
            signal,
        );

        const errors = new Map<string, Error>();

        for (const r of response.Responses || []) {
            // @ts-expect-error - API definition is not correct.
            const details = r as {
                LinkID: string;
                Response: {
                    Code: number;
                    Error?: string;
                    Details: { Missing: string[] };
                };
            };

            if (!details.Response.Code || !isCodeOk(details.Response.Code) || details.Response?.Error) {
                const nodeUid = makeNodeUid(volumeId, details.LinkID);

                if (details.Response.Details?.Missing) {
                    const missingNodeUids = details.Response.Details.Missing.map((linkId) =>
                        makeNodeUid(volumeId, linkId),
                    );
                    errors.set(nodeUid, new MissingRelatedPhotosError(missingNodeUids));
                } else {
                    errors.set(
                        nodeUid,
                        new APICodeError(details.Response.Error || c('Error').t`Unknown error`, details.Response.Code),
                    );
                }
            }
        }

        for (const photoPayload of photoPayloads) {
            const uid = photoPayload.nodeUid;
            const error = errors.get(uid);
            if (error) {
                yield { uid, ok: false, error };
            } else {
                yield { uid, ok: true };
            }
        }
    }

    /**
     * Copy a photo to a shared album on a different volume.
     *
     * To add photos from the same volume to an album, use the {@link addPhotosToAlbum} method.
     *
     * In the future, these two methods will be merged into a single one.
     */
    async copyPhotoToAlbum(
        albumNodeUid: string,
        payload: AddToAlbumEncryptedPhotoPayload,
        signal?: AbortSignal,
    ): Promise<string> {
        const { volumeId: sourceVolumeId, nodeId: sourceLinkId } = splitNodeUid(payload.nodeUid);
        const { volumeId: targetVolumeId, nodeId: targetAlbumLinkId } = splitNodeUid(albumNodeUid);

        try {
            const response = await this.apiService.post<PostCopyLinkRequest, PostCopyLinkResponse>(
                `drive/volumes/${sourceVolumeId}/links/${sourceLinkId}/copy`,
                {
                    TargetVolumeID: targetVolumeId,
                    TargetParentLinkID: targetAlbumLinkId,
                    Hash: payload.nameHash,
                    Name: payload.encryptedName,
                    NameSignatureEmail: payload.nameSignatureEmail,
                    NodePassphrase: payload.nodePassphrase,
                    // @ts-expect-error: API accepts NodePassphraseSignature as optional.
                    NodePassphraseSignature: payload.nodePassphraseSignature,
                    // @ts-expect-error: API accepts SignatureEmail as optional.
                    SignatureEmail: payload.signatureEmail,
                    Photos: {
                        ContentHash: payload.contentHash,
                        RelatedPhotos:
                            payload.relatedPhotos?.map((related) => ({
                                LinkID: splitNodeUid(related.nodeUid).nodeId,
                                Hash: related.nameHash,
                                Name: related.encryptedName,
                                NodePassphrase: related.nodePassphrase,
                                ContentHash: related.contentHash,
                            })) || [],
                    },
                },
                signal,
            );
            return makeNodeUid(targetVolumeId, response.LinkID);
        } catch (error) {
            if (error instanceof InvalidRequirementsAPIError) {
                const { Missing: missingLinkIds } = error.details as { Missing: string[] };
                if (missingLinkIds.length > 0) {
                    throw new MissingRelatedPhotosError(
                        missingLinkIds.map((linkId) => makeNodeUid(sourceVolumeId, linkId)),
                    );
                }
            }
            throw error;
        }
    }

    async *removePhotosFromAlbum(
        albumNodeUid: string,
        photoNodeUids: string[],
        signal?: AbortSignal,
    ): AsyncGenerator<NodeResultWithError> {
        const { volumeId, nodeId: albumLinkId } = splitNodeUid(albumNodeUid);

        const batchSize = 50;

        for (const photoNodeUidsBatch of batch(photoNodeUids, batchSize)) {
            const linkIds = photoNodeUidsBatch.map((nodeUid) => splitNodeUid(nodeUid).nodeId);

            let error: Error | undefined;
            try {
                await this.apiService.post<PostRemovePhotosFromAlbumRequest, PostRemovePhotosFromAlbumResponse>(
                    `drive/photos/volumes/${volumeId}/albums/${albumLinkId}/remove-multiple`,
                    {
                        LinkIDs: linkIds,
                    },
                    signal,
                );
            } catch (e) {
                error = e instanceof Error ? e : new Error(c('Error').t`Unknown error`);
            }

            // The API does not return individual results for each photo.
            for (const uid of photoNodeUidsBatch) {
                if (error) {
                    yield { uid, ok: false, error };
                } else {
                    yield { uid, ok: true };
                }
            }
        }
    }
}
