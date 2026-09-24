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
                originalNameHash: 'originalNameHash1',
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
                        originalNameHash: 'originalNameHash2',
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

    describe('copyPhoto', () => {
        const photoPayloads = [
            {
                nodeUid: 'volumeId2~photoNodeId1',
                contentHash: 'contentHash1',
                nameHash: 'nameHash1',
                originalNameHash: 'originalNameHash1',
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
                        originalNameHash: 'originalNameHash2',
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

            const result = await api.copyPhoto(albumNodeUid, photoPayloads[0]);

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

            const promise = api.copyPhoto(albumNodeUid, photoPayloads[0]);

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

            const promise = api.copyPhoto(albumNodeUid, photoPayloads[0]);

            await expect(promise).rejects.toThrow(error);
        });
    });

    describe('transferPhotos', () => {
        const photoPayloads = [
            {
                nodeUid: 'volumeId1~photoNodeId1',
                contentHash: 'contentHash1',
                nameHash: 'nameHash1',
                originalNameHash: 'originalNameHash1',
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
                        originalNameHash: 'originalNameHash2',
                        encryptedName: 'encryptedName2',
                        nameSignatureEmail: 'nameSignatureEmail2',
                        nodePassphrase: 'nodePassphrase2',
                        nodePassphraseSignature: 'nodePassphraseSignature2',
                        signatureEmail: 'signatureEmail2',
                    },
                ],
            },
        ];

        it('should transfer photos', async () => {
            apiMock.put = jest.fn().mockResolvedValue({
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

            const result = await Array.fromAsync(api.transferPhotos(albumNodeUid, photoPayloads));

            expect(result).toEqual([
                {
                    uid: 'volumeId1~photoNodeId1',
                    ok: true,
                },
            ]);
            expect(apiMock.put).toHaveBeenCalledWith(
                `drive/photos/volumes/volumeId1/links/transfer-multiple`,
                {
                    ParentLinkID: 'albumNodeId',
                    Links: [
                        expect.objectContaining({
                            LinkID: 'photoNodeId1',
                            Hash: 'nameHash1',
                            OriginalHash: 'originalNameHash1',
                            Name: 'encryptedName1',
                            NodePassphrase: 'nodePassphrase1',
                            ContentHash: 'contentHash1',
                            NodePassphraseSignature: null,
                        }),
                        expect.objectContaining({
                            LinkID: 'photoNodeId2',
                            Hash: 'nameHash2',
                            OriginalHash: 'originalNameHash2',
                            Name: 'encryptedName2',
                            NodePassphrase: 'nodePassphrase2',
                            ContentHash: 'contentHash2',
                            NodePassphraseSignature: null,
                        }),
                    ],
                    NameSignatureEmail: 'nameSignatureEmail1',
                    SignatureEmail: null,
                },
                undefined,
            );
        });

        it('should return MissingRelatedPhotosError if related photos are missing', async () => {
            apiMock.put = jest.fn().mockResolvedValue({
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

            const result = await Array.fromAsync(api.transferPhotos(albumNodeUid, photoPayloads));

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
            apiMock.put = jest.fn().mockResolvedValue({
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

            const result = await Array.fromAsync(api.transferPhotos(albumNodeUid, photoPayloads));

            expect(result).toEqual([
                {
                    uid: 'volumeId1~photoNodeId1',
                    ok: false,
                    error: new APICodeError('Some error', 3000),
                },
            ]);
        });

        it('should throw if name signature emails differ', async () => {
            const mixedPayloads = [
                photoPayloads[0],
                {
                    ...photoPayloads[0],
                    nodeUid: 'volumeId1~photoNodeIdOther',
                    nameSignatureEmail: 'other@example.com',
                    relatedPhotos: [],
                },
            ];

            await expect(Array.fromAsync(api.transferPhotos(albumNodeUid, mixedPayloads))).rejects.toThrow(
                'All photos must have the same name signature email',
            );
            expect(apiMock.put).not.toHaveBeenCalled();
        });
    });

    describe('reportRecentlyAccessed', () => {
        describe('batching', () => {
            const makeItems = (count: number) =>
                Array.from({ length: count }, (_, i) => ({
                    nodeUid: `volumeId1~photoNodeId${i}`,
                    accessTime: new Date(1700000000000 + i * 1000),
                }));
            const getSentLinkIds = () =>
                (apiMock.post as jest.Mock).mock.calls.map(([, body]) =>
                    body.RecentlyAccessedItems.map((item: { LinkID: string }) => item.LinkID),
                );

            beforeEach(() => {
                apiMock.post = jest.fn().mockResolvedValue({ Code: 1000 });
            });

            it('should not call the API when there are no items', async () => {
                await api.reportRecentlyAccessed([]);

                expect(apiMock.post).not.toHaveBeenCalled();
            });

            it('should send exactly 50 items in one request', async () => {
                await api.reportRecentlyAccessed(makeItems(50));

                expect(getSentLinkIds().map((ids) => ids.length)).toEqual([50]);
            });

            it('should send 51 items in two requests', async () => {
                await api.reportRecentlyAccessed(makeItems(51));

                expect(getSentLinkIds().map((ids) => ids.length)).toEqual([50, 1]);
            });

            it('should split many items into requests of at most 50', async () => {
                await api.reportRecentlyAccessed(makeItems(120));

                expect(getSentLinkIds().map((ids) => ids.length)).toEqual([50, 50, 20]);
            });

            it('should keep item order across requests', async () => {
                await api.reportRecentlyAccessed(makeItems(51));

                const [firstBatch, secondBatch] = getSentLinkIds();
                expect(firstBatch[0]).toBe('photoNodeId0');
                expect(firstBatch[49]).toBe('photoNodeId49');
                expect(secondBatch).toEqual(['photoNodeId50']);
            });

            it('should throw the API error and stop sending remaining requests', async () => {
                const error = new Error('API failure');
                apiMock.post = jest
                    .fn()
                    .mockResolvedValueOnce({ Code: 1000 })
                    .mockRejectedValueOnce(error)
                    .mockResolvedValueOnce({ Code: 1000 });

                await expect(api.reportRecentlyAccessed(makeItems(130))).rejects.toBe(error);
                expect(apiMock.post).toHaveBeenCalledTimes(2);
            });
        });

        it('should report recently accessed photo nodes in one request', async () => {
            apiMock.post = jest.fn().mockResolvedValue({ Code: 1000 });

            await api.reportRecentlyAccessed([
                { nodeUid: 'volumeId1~photoNodeId1', accessTime: new Date(1700000000000) },
                { nodeUid: 'volumeId2~photoNodeId12', accessTime: new Date(1700000100500) },
            ]);

            expect(apiMock.post).toHaveBeenCalledWith('drive/photos/recently-accessed-items', {
                RecentlyAccessedItems: [
                    {
                        VolumeID: 'volumeId1',
                        LinkID: 'photoNodeId1',
                        AccessTime: 1700000000,
                    },
                    {
                        VolumeID: 'volumeId2',
                        LinkID: 'photoNodeId12',
                        AccessTime: 1700000100,
                    },
                ],
            });
        });
    });
});
