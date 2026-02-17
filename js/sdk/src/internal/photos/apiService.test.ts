import { DriveAPIService } from '../apiService/apiService';
import { APICodeError, InvalidRequirementsAPIError } from '../apiService/errors';
import { PhotosAPIService } from './apiService';
import { MissingRelatedPhotosError } from './errors';

describe('photosAPIService', () => {
    let apiMock: DriveAPIService;
    let api: PhotosAPIService;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error Mocking for testing purposes
        apiMock = {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
        };

        api = new PhotosAPIService(apiMock);
    });

    const albumNodeUid = 'volumeId1~albumNodeId';

    describe('addPhotosToAlbum', () => {
        const photoPayloads = [
            {
                nodeUid: 'volumeId1~photoNodeId1',
                contentHash: 'contentHash1',
                nameHash: 'nameHash1',
                encryptedName: 'encryptedName1',
                nameSignatureEmail: 'nameSignatureEmail1',
                nodePassphrase: 'nodePassphrase1',
                nodePassphraseSignature: 'nodePassphraseSignature1',
                signatureEmail: 'signatureEmail1',
                relatedPhotos: [
                    {
                        nodeUid: 'volumeId1~photoNodeId2',
                        contentHash: 'contentHash2',
                        nameHash: 'nameHash2',
                        encryptedName: 'encryptedName2',
                        nameSignatureEmail: 'nameSignatureEmail2',
                        nodePassphrase: 'nodePassphrase2',
                        nodePassphraseSignature: 'nodePassphraseSignature2',
                        signatureEmail: 'signatureEmail2',
                    },
                ],
            },
        ];

        it('should add photos to album', async () => {
            apiMock.post = jest.fn().mockResolvedValue({
                Code: 1000,
                Responses: [
                    {
                        LinkID: 'photoNodeId1',
                        Response: {
                            Code: 1000,
                        },
                    },
                ],
            });

            const result = await Array.fromAsync(api.addPhotosToAlbum(albumNodeUid, photoPayloads));

            expect(result).toEqual([
                {
                    uid: 'volumeId1~photoNodeId1',
                    ok: true,
                },
            ]);
            expect(apiMock.post).toHaveBeenCalledWith(
                `drive/photos/volumes/volumeId1/albums/albumNodeId/add-multiple`,
                {
                    AlbumData: [
                        expect.objectContaining({
                            LinkID: 'photoNodeId1',
                            Hash: 'nameHash1',
                            Name: 'encryptedName1',
                            NameSignatureEmail: 'nameSignatureEmail1',
                        }),
                        expect.objectContaining({
                            LinkID: 'photoNodeId2',
                            Hash: 'nameHash2',
                            Name: 'encryptedName2',
                            NameSignatureEmail: 'nameSignatureEmail2',
                        }),
                    ],
                },
                undefined,
            );
        });

        it('should return MissingRelatedPhotosError if related photos are missing', async () => {
            apiMock.post = jest.fn().mockResolvedValue({
                Code: 1000,
                Responses: [
                    {
                        LinkID: 'photoNodeId1',
                        Response: {
                            Code: 2000,
                            Details: {
                                Missing: ['photoNodeId3'],
                            },
                        },
                    },
                ],
            });

            const result = await Array.fromAsync(api.addPhotosToAlbum(albumNodeUid, photoPayloads));

            expect(result).toEqual([
                {
                    uid: 'volumeId1~photoNodeId1',
                    ok: false,
                    error: new MissingRelatedPhotosError([]),
                },
            ]);
            expect((result[0] as any).error.missingNodeUids).toEqual(['volumeId1~photoNodeId3']);
        });

        it('should return error for unknown error', async () => {
            apiMock.post = jest.fn().mockResolvedValue({
                Code: 1000,
                Responses: [
                    {
                        LinkID: 'photoNodeId1',
                        Response: {
                            Code: 3000,
                            Error: 'Some error',
                        },
                    },
                ],
            });

            const result = await Array.fromAsync(api.addPhotosToAlbum(albumNodeUid, photoPayloads));

            expect(result).toEqual([
                {
                    uid: 'volumeId1~photoNodeId1',
                    ok: false,
                    error: new APICodeError('Some error', 3000),
                },
            ]);
        });
    });

    describe('copyPhotoToAlbum', () => {
        const photoPayloads = [
            {
                nodeUid: 'volumeId2~photoNodeId1',
                contentHash: 'contentHash1',
                nameHash: 'nameHash1',
                encryptedName: 'encryptedName1',
                nameSignatureEmail: 'nameSignatureEmail1',
                nodePassphrase: 'nodePassphrase1',
                nodePassphraseSignature: 'nodePassphraseSignature1',
                signatureEmail: 'signatureEmail1',
                relatedPhotos: [
                    {
                        nodeUid: 'volumeId2~photoNodeId2',
                        contentHash: 'contentHash2',
                        nameHash: 'nameHash2',
                        encryptedName: 'encryptedName2',
                        nameSignatureEmail: 'nameSignatureEmail2',
                        nodePassphrase: 'nodePassphrase2',
                        nodePassphraseSignature: 'nodePassphraseSignature2',
                        signatureEmail: 'signatureEmail2',
                    },
                ],
            },
        ];

        it('should copy photo to album', async () => {
            apiMock.post = jest.fn().mockResolvedValue({
                Code: 1000,
                LinkID: 'photoNodeId1',
            });

            const result = await api.copyPhotoToAlbum(albumNodeUid, photoPayloads[0]);

            expect(result).toEqual('volumeId1~photoNodeId1');
            expect(apiMock.post).toHaveBeenCalledWith(
                `drive/volumes/volumeId2/links/photoNodeId1/copy`,
                expect.objectContaining({
                    TargetVolumeID: 'volumeId1',
                    TargetParentLinkID: 'albumNodeId',
                    Hash: 'nameHash1',
                    Name: 'encryptedName1',
                    Photos: {
                        ContentHash: 'contentHash1',
                        RelatedPhotos: expect.arrayContaining([
                            expect.objectContaining({
                                LinkID: 'photoNodeId2',
                                Hash: 'nameHash2',
                                Name: 'encryptedName2',
                            }),
                        ]),
                    },
                }),
                undefined,
            );
        });

        it('should return MissingRelatedPhotosError if related photos are missing', async () => {
            apiMock.post = jest.fn().mockRejectedValue(new InvalidRequirementsAPIError(
                'Missing related photos',
                2000,
                {
                    Missing: ['photoNodeId3'],
                },
            ));

            const promise = api.copyPhotoToAlbum(albumNodeUid, photoPayloads[0]);

            await expect(promise).rejects.toThrow(MissingRelatedPhotosError);
            try {
                await promise;
            } catch (error) {
                expect((error as MissingRelatedPhotosError).missingNodeUids).toEqual(['volumeId2~photoNodeId3']);
            }
        });

        it('should return error for unknown error', async () => {
            const error = new APICodeError('Some error', 3000);
            apiMock.post = jest.fn().mockRejectedValue(error);

            const promise = api.copyPhotoToAlbum(albumNodeUid, photoPayloads[0]);

            await expect(promise).rejects.toThrow(error);
        });
    });
});
