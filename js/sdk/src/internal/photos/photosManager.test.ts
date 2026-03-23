import { resultOk, PhotoTag } from '../../interface';
import { getMockLogger } from '../../tests/logger';
import { PhotosManager, UpdatePhotoSettings } from './photosManager';
import { PhotosAPIService } from './apiService';
import { AlbumsCryptoService } from './albumsCrypto';
import { PhotosNodesAccess } from './nodes';
import { DecryptedPhotoNode } from './interface';
import { MissingRelatedPhotosError } from './errors';

function createMockPhotoNode(uid: string, overrides: Partial<DecryptedPhotoNode> = {}): DecryptedPhotoNode {
    return {
        uid,
        parentUid: 'volume1~parent',
        hash: 'hash',
        name: resultOk('photo.jpg'),
        photo: {
            captureTime: new Date(),
            mainPhotoNodeUid: undefined,
            relatedPhotoNodeUids: [],
            tags: [],
            albums: [],
        },
        activeRevision: {
            ok: true,
            value: {
                uid: 'rev1',
                state: 'active' as const,
                creationTime: new Date(),
                storageSize: 100,
                signatureEmail: 'test@example.com',
                claimedModificationTime: new Date(),
                claimedSize: 100,
                claimedDigests: { sha1: 'sha1hash' },
                claimedBlockSizes: [100],
            },
        },
        keyAuthor: { ok: true, value: 'test@example.com' },
        ...overrides,
    } as DecryptedPhotoNode;
}

async function collectUpdateResults(manager: PhotosManager, photos: UpdatePhotoSettings[], signal?: AbortSignal) {
    const results = [];
    for await (const result of manager.updatePhotos(photos, signal)) {
        results.push(result);
    }
    return results;
}

async function collectSaveToTimelineResults(manager: PhotosManager, nodeUids: string[], signal?: AbortSignal) {
    const results = [];
    for await (const result of manager.saveToTimeline(nodeUids, signal)) {
        results.push(result);
    }
    return results;
}

describe('PhotosManager', () => {
    let logger: ReturnType<typeof getMockLogger>;
    let apiService: jest.Mocked<
        Pick<PhotosAPIService, 'addPhotoTags' | 'removePhotoTags' | 'setPhotoFavorite' | 'transferPhotos'>
    >;
    let cryptoService: jest.Mocked<Pick<AlbumsCryptoService, 'encryptPhotoForAlbum'>>;
    let nodesService: jest.Mocked<
        Pick<
            PhotosNodesAccess,
            | 'getVolumeRootFolder'
            | 'getNodeKeys'
            | 'getNodeSigningKeys'
            | 'iterateNodes'
            | 'getNodePrivateAndSessionKeys'
            | 'notifyNodeChanged'
        >
    >;
    let manager: PhotosManager;

    const volumeRootKeys = {
        key: 'rootKey' as any,
        hashKey: new Uint8Array([1, 2, 3]),
    };
    const signingKeys = {
        type: 'userAddress' as const,
        email: 'test@example.com',
        addressId: 'addressId',
        key: 'signingKey' as any,
    };
    beforeEach(() => {
        logger = getMockLogger();

        apiService = {
            addPhotoTags: jest.fn().mockResolvedValue(undefined),
            removePhotoTags: jest.fn().mockResolvedValue(undefined),
            setPhotoFavorite: jest.fn().mockResolvedValue(undefined),
            transferPhotos: jest.fn().mockImplementation(async function* () {}),
        };

        cryptoService = {
            encryptPhotoForAlbum: jest.fn().mockResolvedValue({
                contentHash: 'contentHash',
                hash: 'nameHash',
                encryptedName: 'encryptedName',
                nameSignatureEmail: 'test@example.com',
                armoredNodePassphrase: 'passphrase',
                armoredNodePassphraseSignature: 'signature',
                signatureEmail: 'test@example.com',
            }),
        };

        nodesService = {
            getVolumeRootFolder: jest.fn().mockResolvedValue({ uid: 'volume1~root' }),
            getNodeKeys: jest.fn().mockResolvedValue(volumeRootKeys),
            getNodeSigningKeys: jest.fn().mockResolvedValue(signingKeys),
            iterateNodes: jest.fn().mockImplementation(async function* (uids: string[]) {
                for (const uid of uids) {
                    yield createMockPhotoNode(uid);
                }
            }),
            getNodePrivateAndSessionKeys: jest.fn().mockResolvedValue({
                key: 'nodeKey' as any,
                nameSessionKey: 'sessionKey' as any,
                passphrase: 'passphrase',
                passphraseSessionKey: 'passphraseSessionKey' as any,
            }),
            notifyNodeChanged: jest.fn().mockResolvedValue(undefined),
        };

        manager = new PhotosManager(logger, apiService as any, cryptoService as any, nodesService as any);
    });

    describe('updatePhotos', () => {
        describe('add tags only', () => {
            it('calls addPhotoTags and notifyNodeChanged for each photo', async () => {
                const results = await collectUpdateResults(manager, [
                    { nodeUid: 'volume1~photo1', tagsToAdd: [PhotoTag.Screenshots], tagsToRemove: [] },
                    { nodeUid: 'volume1~photo2', tagsToAdd: [PhotoTag.LivePhotos], tagsToRemove: [] },
                ]);

                expect(results).toEqual([
                    { uid: 'volume1~photo1', ok: true },
                    { uid: 'volume1~photo2', ok: true },
                ]);
                expect(apiService.addPhotoTags).toHaveBeenCalledTimes(2);
                expect(apiService.addPhotoTags).toHaveBeenCalledWith('volume1~photo1', [PhotoTag.Screenshots]);
                expect(apiService.addPhotoTags).toHaveBeenCalledWith('volume1~photo2', [PhotoTag.LivePhotos]);
                expect(nodesService.getVolumeRootFolder).not.toHaveBeenCalled();
                expect(apiService.setPhotoFavorite).not.toHaveBeenCalled();
                expect(nodesService.notifyNodeChanged).toHaveBeenCalledTimes(2);
                expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('volume1~photo1');
                expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('volume1~photo2');
            });

            it('filters Favorites from addTags and calls setPhotoFavorite with payload', async () => {
                const results = await collectUpdateResults(manager, [
                    { nodeUid: 'volume1~photo1', tagsToAdd: [PhotoTag.Favorites], tagsToRemove: [] },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: true }]);
                expect(nodesService.getVolumeRootFolder).toHaveBeenCalled();
                expect(nodesService.getNodeKeys).toHaveBeenCalledWith('volume1~root');
                expect(nodesService.getNodeSigningKeys).toHaveBeenCalledWith({ nodeUid: 'volume1~root' });
                expect(apiService.setPhotoFavorite).toHaveBeenCalledTimes(1);
                expect(apiService.setPhotoFavorite).toHaveBeenCalledWith(
                    'volume1~photo1',
                    expect.objectContaining({
                        nodeUid: 'volume1~photo1',
                        contentHash: 'contentHash',
                        nameHash: 'nameHash',
                        relatedPhotos: [],
                    }),
                );
                expect(apiService.addPhotoTags).not.toHaveBeenCalled();
                expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('volume1~photo1');
            });

            it('calls setPhotoFavorite and addPhotoTags when addTags includes Favorites and other tags', async () => {
                const results = await collectUpdateResults(manager, [
                    {
                        nodeUid: 'volume1~photo1',
                        tagsToAdd: [PhotoTag.Favorites, PhotoTag.Screenshots],
                        tagsToRemove: [],
                    },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: true }]);
                expect(apiService.setPhotoFavorite).toHaveBeenCalledWith('volume1~photo1', expect.any(Object));
                expect(apiService.addPhotoTags).toHaveBeenCalledWith('volume1~photo1', [PhotoTag.Screenshots]);
            });

            it('calls setPhotoFavorite when payload builder returns PhotoAlreadyInTargetError (photo already in root)', async () => {
                nodesService.iterateNodes.mockImplementation(async function* (uids: string[]) {
                    for (const uid of uids) {
                        yield createMockPhotoNode(uid, { parentUid: 'volume1~root' });
                    }
                });

                const results = await collectUpdateResults(manager, [
                    { nodeUid: 'volume1~photo1', tagsToAdd: [PhotoTag.Favorites], tagsToRemove: [] },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: true }]);
                expect(apiService.setPhotoFavorite).toHaveBeenCalledWith('volume1~photo1', undefined);
                expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('volume1~photo1');
            });
        });

        describe('remove tags only', () => {
            it('calls removePhotoTags and notifyNodeChanged for each photo', async () => {
                const results = await collectUpdateResults(manager, [
                    { nodeUid: 'volume1~photo1', tagsToAdd: [], tagsToRemove: [PhotoTag.Screenshots] },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: true }]);
                expect(apiService.removePhotoTags).toHaveBeenCalledWith('volume1~photo1', [PhotoTag.Screenshots]);
                expect(apiService.addPhotoTags).not.toHaveBeenCalled();
                expect(nodesService.getVolumeRootFolder).not.toHaveBeenCalled();
                expect(apiService.setPhotoFavorite).not.toHaveBeenCalled();
                expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('volume1~photo1');
            });
        });

        describe('add and remove tags together', () => {
            it('calls addPhotoTags and removePhotoTags and notifyNodeChanged', async () => {
                const results = await collectUpdateResults(manager, [
                    {
                        nodeUid: 'volume1~photo1',
                        tagsToAdd: [PhotoTag.Panoramas],
                        tagsToRemove: [PhotoTag.Screenshots],
                    },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: true }]);
                expect(apiService.addPhotoTags).toHaveBeenCalledWith('volume1~photo1', [PhotoTag.Panoramas]);
                expect(apiService.removePhotoTags).toHaveBeenCalledWith('volume1~photo1', [PhotoTag.Screenshots]);
                expect(apiService.setPhotoFavorite).not.toHaveBeenCalled();
                expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('volume1~photo1');
            });
        });

        describe('API failures', () => {
            it('yields error result and logs when setPhotoFavorite fails', async () => {
                const apiError = new Error('Favorite API failed');
                apiService.setPhotoFavorite.mockRejectedValue(apiError);

                const results = await collectUpdateResults(manager, [
                    { nodeUid: 'volume1~photo1', tagsToAdd: [PhotoTag.Favorites], tagsToRemove: [] },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: false, error: apiError }]);
                expect(logger.error).toHaveBeenCalledWith('Update photos failed for volume1~photo1', apiError);
                expect(nodesService.notifyNodeChanged).not.toHaveBeenCalled();
            });

            it('yields error result when addPhotoTags fails', async () => {
                const apiError = new Error('Add tags failed');
                apiService.addPhotoTags.mockRejectedValue(apiError);

                const results = await collectUpdateResults(manager, [
                    { nodeUid: 'volume1~photo1', tagsToAdd: [PhotoTag.Screenshots], tagsToRemove: [] },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: false, error: apiError }]);
                expect(nodesService.notifyNodeChanged).not.toHaveBeenCalled();
            });

            it('yields error result when removePhotoTags fails', async () => {
                const apiError = new Error('Remove tags failed');
                apiService.removePhotoTags.mockRejectedValue(apiError);

                const results = await collectUpdateResults(manager, [
                    { nodeUid: 'volume1~photo1', tagsToAdd: [], tagsToRemove: [PhotoTag.Videos] },
                ]);

                expect(results).toEqual([{ uid: 'volume1~photo1', ok: false, error: apiError }]);
                expect(nodesService.notifyNodeChanged).not.toHaveBeenCalled();
            });
        });
    });

    describe('saveToTimeline', () => {
        it('re-queues once on MissingRelatedPhotosError then succeeds without yielding the retry error', async () => {
            const missingRelatedUid = 'volume1~related1';
            let transferCall = 0;
            apiService.transferPhotos.mockImplementation(async function* (_rootUid, payloads) {
                transferCall++;
                for (const payload of payloads) {
                    if (transferCall === 1) {
                        yield {
                            uid: payload.nodeUid,
                            ok: false,
                            error: new MissingRelatedPhotosError([missingRelatedUid]),
                        };
                    } else {
                        yield { uid: payload.nodeUid, ok: true };
                    }
                }
            });

            const results = await collectSaveToTimelineResults(manager, ['volume1~photo1']);

            expect(results).toEqual([{ uid: 'volume1~photo1', ok: true }]);
            expect(apiService.transferPhotos).toHaveBeenCalledTimes(2);
            expect(logger.info).toHaveBeenCalledWith(
                `Missing related photos for saving volume1~photo1, re-queuing: ${missingRelatedUid}`,
            );
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('volume1~photo1');
        });
    });
});
