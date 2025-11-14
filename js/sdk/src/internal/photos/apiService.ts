import { DriveAPIService, drivePaths } from '../apiService';
import { EncryptedRootShare, EncryptedShareCrypto, ShareType } from '../shares/interface';
import { makeNodeUid } from '../uids';

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

type PostPhotoDuplicateRequest = Extract<
    drivePaths['/drive/volumes/{volumeID}/photos/duplicates']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostPhotoDuplicateResponse =
    drivePaths['/drive/volumes/{volumeID}/photos/duplicates']['post']['responses']['200']['content']['application/json'];

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
}
