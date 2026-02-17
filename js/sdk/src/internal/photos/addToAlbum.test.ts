import { NodeResultWithError } from '../../interface';
import { getMockLogger } from '../../tests/logger';
import { AddToAlbumProcess } from './addToAlbum';
import { AlbumsCryptoService } from './albumsCrypto';
import { PhotosAPIService } from './apiService';
import { MissingRelatedPhotosError } from './errors';
import { DecryptedPhotoNode } from './interface';
import { PhotosNodesAccess } from './nodes';

/**
 * Helper to create a mock photo node with minimal required properties.
 */
function createMockPhotoNode(
    uid: string,
    overrides: Partial<DecryptedPhotoNode> = {},
): DecryptedPhotoNode {
    return {
        uid,
        parentUid: 'volume1~parent',
        hash: 'hash',
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

describe('AddToAlbumProcess', () => {
    let apiService: jest.Mocked<PhotosAPIService>;
    let cryptoService: jest.Mocked<AlbumsCryptoService>;
    let nodesService: jest.Mocked<PhotosNodesAccess>;
    let albumKeys: { key: unknown; hashKey: Uint8Array; passphrase: string; passphraseSessionKey: unknown };
    let signingKeys: { type: 'userAddress'; email: string; addressId: string; key: unknown };

    beforeEach(() => {
        albumKeys = {
            key: 'albumKey' as any,
            hashKey: new Uint8Array([1, 2, 3]),
            passphrase: 'passphrase',
            passphraseSessionKey: 'passphraseSessionKey' as any,
        };

        signingKeys = {
            type: 'userAddress',
            email: 'test@example.com',
            addressId: 'addressId',
            key: 'signingKey' as any,
        };

        // @ts-expect-error Mocking for testing purposes
        apiService = {
            addPhotosToAlbum: jest.fn(),
            copyPhotoToAlbum: jest.fn(),
        };

        // @ts-expect-error Mocking for testing purposes
        cryptoService = {
            encryptPhotoForAlbum: jest.fn(),
        };

        // @ts-expect-error Mocking for testing purposes
        nodesService = {
            iterateNodes: jest.fn(),
            getNodePrivateAndSessionKeys: jest.fn(),
            notifyNodeChanged: jest.fn(),
            notifyChildCreated: jest.fn(),
        };
    });

    function executeProcess(photoUids: string[]): Promise<NodeResultWithError[]> {
        const process = new AddToAlbumProcess(
            'volume1~album',
            albumKeys as any,
            signingKeys as any,
            apiService,
            cryptoService,
            nodesService,
            getMockLogger(),
        );
        return Array.fromAsync(process.execute(photoUids));
    }

    beforeEach(() => {
        nodesService.iterateNodes.mockImplementation(async function* (uids) {
            for (const uid of uids) {
                const photoNode = createMockPhotoNode(uid);

                // Handle uids in the form 'volumeId~mainPhoto-related:X' where X is the number of related photos
                const relatedMatch = /^(.+)~(.+)-related:(\d+)$/.exec(uid);
                if (relatedMatch) {
                    const [, volumeId, mainPhoto, countStr] = relatedMatch;
                    const count = parseInt(countStr, 10);
                    photoNode.photo!.relatedPhotoNodeUids = Array.from({ length: count }, (_, idx) => `${volumeId}~related${idx + 1}`);
                }

                yield photoNode;
            }
        });

        nodesService.getNodePrivateAndSessionKeys.mockResolvedValue({
            key: 'nodeKey' as any,
            nameSessionKey: 'sessionKey' as any,
            passphrase: 'passphrase',
            passphraseSessionKey: 'passphraseSessionKey' as any,
        });

        cryptoService.encryptPhotoForAlbum.mockResolvedValue({
            contentHash: 'contentHash',
            hash: 'nameHash',
            encryptedName: 'encryptedName',
            nameSignatureEmail: 'test@example.com',
            armoredNodePassphrase: 'passphrase',
            armoredNodePassphraseSignature: 'signature',
            signatureEmail: 'test@example.com',
        });

        let addToAlbumReturnedMissing = false;
        apiService.addPhotosToAlbum.mockImplementation(async function* (albumUid, payloads) {
            for (const payload of payloads) {
                let error: Error | undefined;
                if (payload.nodeUid.includes('missingRelatedTwice')) {
                    error = new MissingRelatedPhotosError(['volume1~missingRelatedTwice1']);
                    addToAlbumReturnedMissing = true;
                }
                if (!addToAlbumReturnedMissing && payload.nodeUid.includes('missingRelatedOnce')) {
                    error = new MissingRelatedPhotosError(['volume1~missingRelatedOnce1']);
                    addToAlbumReturnedMissing = true;
                }
                if (error) {
                    yield { uid: payload.nodeUid, ok: false, error };
                } else {
                    yield { uid: payload.nodeUid, ok: true };
                }
            }
        });

        let copyToAlbumReturnedMissing = false;
        apiService.copyPhotoToAlbum.mockImplementation(async (albumUid, payload) => {
            let error: Error | undefined;
            if (payload.nodeUid.includes('missingRelatedTwice')) {
                error = new MissingRelatedPhotosError(['volume2~missingRelatedTwice1']);
                copyToAlbumReturnedMissing = true;
            }
            if (!copyToAlbumReturnedMissing && payload.nodeUid.includes('missingRelatedOnce')) {
                error = new MissingRelatedPhotosError(['volume2~missingRelatedOnce1']);
                copyToAlbumReturnedMissing = true;
            }
            if (error) {
                throw error;
            }
            return `volume1~copied${payload.nodeUid}`;
        });
    })

    describe('Adding photos to the same volume', () => {
        it('should prepare photo payloads in parallel without blocking', async () => {
            // Setup: 25 photos (more than BATCH_LOADING_SIZE of 20)
            const photoUids = Array.from({ length: 25 }, (_, i) => `volume1~photo${i}`);

            let addPhotosCallCount = 0;
            apiService.addPhotosToAlbum.mockImplementation(async function* (albumUid, payloads) {
                addPhotosCallCount++;

                // First call should happen before all 25 photos are prepared
                // (should only have first batch of 20 prepared)
                if (addPhotosCallCount === 1) {
                    expect(nodesService.iterateNodes).toHaveBeenCalledTimes(1);
                }

                for (const payload of payloads) {
                    yield { uid: payload.nodeUid, ok: true };
                }
            });

            const results = await executeProcess(photoUids);

            expect(results).toHaveLength(25);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(2);
            expect(nodesService.iterateNodes.mock.calls[0][0]).toHaveLength(20);
            expect(nodesService.iterateNodes.mock.calls[1][0]).toHaveLength(5);
            expect(apiService.addPhotosToAlbum).toHaveBeenCalledTimes(3);
            expect(apiService.addPhotosToAlbum.mock.calls[0][1].length).toBe(10);
            expect(apiService.addPhotosToAlbum.mock.calls[1][1].length).toBe(10);
            expect(apiService.addPhotosToAlbum.mock.calls[2][1].length).toBe(5);
        });

        it('should include related photos in the same batch even if it exceeds batch size', async () => {
            // Create a photo with 15 related photos (total size = 16, which exceeds batch size of 10)
            const mainPhotoUid = 'volume1~mainPhoto-related:15';

            const results = await executeProcess([mainPhotoUid]);

            expect(results).toMatchObject([{
                uid: mainPhotoUid,
                ok: true,
            }])

            expect(apiService.addPhotosToAlbum).toHaveBeenCalledTimes(1);
            const params = apiService.addPhotosToAlbum.mock.calls[0];
            expect(params[1].length).toBe(1);
            expect(params[1][0].relatedPhotos?.length).toBe(15);
        });

        it('should re-queue photo when missing related photos error occurs', async () => {
            const photoUid = 'volume1~mainPhoto-related:1-missingRelatedOnce';

            const process = new AddToAlbumProcess(
                'volume1~album',
                albumKeys as any,
                signingKeys as any,
                apiService,
                cryptoService,
                nodesService,
                getMockLogger(),
            );
            const results = await Array.fromAsync(process.execute([photoUid]));

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: true,
            }])
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(3); // main photo + related photo + missing related photo
            expect(apiService.addPhotosToAlbum).toHaveBeenCalledTimes(2); // two attempts
        });

        it('should return error if missing related photos error occurs twice', async () => {
            const photoUid = 'volume1~photo1-missingRelatedTwice';

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: new MissingRelatedPhotosError(['volume1~missingRelatedOnce1']),
            }])
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(3); // main photo + related photo + missing related photo
            expect(apiService.addPhotosToAlbum).toHaveBeenCalledTimes(2); // two attempts
        });

        it('should return error when crypto service fails', async () => {
            const photoUid = 'volume1~photo1';

            const cryptoError = new Error('Crypto operation failed');
            cryptoService.encryptPhotoForAlbum.mockRejectedValue(cryptoError);

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: cryptoError,
            }])
        });

        it('should return error when getNodePrivateAndSessionKeys fails', async () => {
            const photoUid = 'volume1~photo1';

            const keysError = new Error('Failed to get keys');
            nodesService.getNodePrivateAndSessionKeys.mockRejectedValue(keysError);

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: keysError,
            }])
        });

        it('should notify node changed for successfully added photos', async () => {
            const photoUid = 'volume1~photo1';
            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: true,
            }])
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledTimes(1);
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith(photoUid);
        });

        it('should not notify node changed for failed photos', async () => {
            const photoUid = 'volume1~photo1';

            apiService.addPhotosToAlbum.mockImplementation(async function* (albumUid, payloads) {
                yield { uid: photoUid, ok: false, error: new Error('API error') };
            });

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: new Error('API error'),
            }])
            expect(nodesService.notifyNodeChanged).not.toHaveBeenCalled();
        });
    });

    describe('Adding photos to a different volume', () => {
        it('should prepare photo payloads in parallel without blocking', async () => {
            // Setup: 25 photos from different volume (more than BATCH_LOADING_SIZE of 20)
            const photoUids = Array.from({ length: 25 }, (_, i) => `volume2~photo${i}`);

            let copyPhotoCallCount = 0;
            apiService.copyPhotoToAlbum.mockImplementation(async (albumUid, payload) => {
                copyPhotoCallCount++;

                // First few calls should happen before all 25 photos are prepared
                if (copyPhotoCallCount <= 20) {
                    expect(nodesService.iterateNodes).toHaveBeenCalledTimes(1);
                }

                return `volume1~copied${copyPhotoCallCount}`;
            });

            const results = await executeProcess(photoUids);

            expect(results).toHaveLength(25);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(2);
            expect(nodesService.iterateNodes.mock.calls[0][0]).toHaveLength(20);
            expect(nodesService.iterateNodes.mock.calls[1][0]).toHaveLength(5);
            expect(copyPhotoCallCount).toBe(25);
        });

        it('should include related photos in copy request', async () => {
            const mainPhotoUid = 'volume2~mainPhoto-related:15';

            const results = await executeProcess([mainPhotoUid]);

            expect(results).toMatchObject([{
                uid: mainPhotoUid,
                ok: true,
            }])
            expect(apiService.copyPhotoToAlbum).toHaveBeenCalledTimes(1);
            const params = apiService.copyPhotoToAlbum.mock.calls[0];
            expect(params[1].relatedPhotos?.length).toBe(15);
        });

        it('should re-queue photo when missing related photos error occurs', async () => {
            const photoUid = 'volume2~photo1-related:1-missingRelatedOnce';

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: true,
            }]);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(3); // main photo + related photo + missing related photo
            expect(apiService.copyPhotoToAlbum).toHaveBeenCalledTimes(2); // two attempts
        });

        it('should return error if missing related photos error occurs twice', async () => {
            const photoUid = 'volume2~photo1-missingRelatedTwice';

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: new MissingRelatedPhotosError(['volume2~missingRelatedOnce1']),
            }]);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(3); // main photo + related photo + missing related photo
            expect(apiService.copyPhotoToAlbum).toHaveBeenCalledTimes(2); // two attempts
        });

        it('should return error when crypto service fails', async () => {
            const photoUid = 'volume2~photo1';

            const cryptoError = new Error('Crypto operation failed');
            cryptoService.encryptPhotoForAlbum.mockRejectedValue(cryptoError);

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: cryptoError,
            }]);
        });

        it('should return error when getNodePrivateAndSessionKeys fails', async () => {
            const photoUid = 'volume2~photo1';

            const keysError = new Error('Failed to get keys');
            nodesService.getNodePrivateAndSessionKeys.mockRejectedValue(keysError);

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: keysError,
            }]);
        });

        it('should notify child created for successfully copied photos', async () => {
            const photoUid = 'volume2~photo1';
            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: true,
            }])
            expect(nodesService.notifyChildCreated).toHaveBeenCalledTimes(1);
            expect(nodesService.notifyChildCreated.mock.calls[0][0]).toContain('volume1~copied');
        });

        it('should not notify for failed photo copies', async () => {
            const photoUid = 'volume2~photo1';

            apiService.copyPhotoToAlbum.mockRejectedValue(new Error('API error'));

            const results = await executeProcess([photoUid]);

            expect(results).toMatchObject([{
                uid: photoUid,
                ok: false,
                error: new Error('API error'),
            }])
            expect(nodesService.notifyChildCreated).not.toHaveBeenCalled();
        });
    });

    describe('Adding photos from both same and different volumes', () => {
        it('should process same volume photos first, then different volume photos', async () => {
            const sameVolumeUids = ['volume1~photo1', 'volume1~photo2'];
            const differentVolumeUids = ['volume2~photo3', 'volume2~photo4'];
            const allUids = [...sameVolumeUids, ...differentVolumeUids];

            const results = await executeProcess(allUids);

            expect(results).toMatchObject([{
                uid: sameVolumeUids[0],
                ok: true,
            }, {
                uid: sameVolumeUids[1],
                ok: true,
            }, {
                uid: differentVolumeUids[0],
                ok: true,
            }, {
                uid: differentVolumeUids[1],
                ok: true,
            }]);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(2);
            expect(nodesService.iterateNodes.mock.calls[0][0]).toMatchObject(sameVolumeUids);
            expect(nodesService.iterateNodes.mock.calls[1][0]).toMatchObject(differentVolumeUids);
            expect(apiService.addPhotosToAlbum).toHaveBeenCalledTimes(1);
            expect(apiService.addPhotosToAlbum.mock.calls[0][1].map(({ nodeUid }) => nodeUid)).toMatchObject(sameVolumeUids);
            expect(apiService.copyPhotoToAlbum).toHaveBeenCalledTimes(2);
            expect(apiService.copyPhotoToAlbum.mock.calls[0][1].nodeUid).toBe(differentVolumeUids[0]);
            expect(apiService.copyPhotoToAlbum.mock.calls[1][1].nodeUid).toBe(differentVolumeUids[1]);
        });

        it('should prepare payloads in parallel for both queues', async () => {
            // 25 photos from same volume, 25 from different volume
            const sameVolumeUids = Array.from({ length: 25 }, (_, i) => `volume1~photo${i}`);
            const differentVolumeUids = Array.from({ length: 25 }, (_, i) => `volume2~photo${i}`);
            const allUids = [...sameVolumeUids, ...differentVolumeUids];

            const results = await executeProcess(allUids);

            expect(results).toHaveLength(50);
            // Each volume should have been loaded in 2 batches (20 + 5)
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(2 + 2);
        });

        it('should handle retries correctly for both volumes', async () => {
            const sameVolumeUid = 'volume1~photo1-related:1-missingRelatedOnce';
            const differentVolumeUid = 'volume2~photo2-related:1-missingRelatedOnce';

            const results = await executeProcess([sameVolumeUid, differentVolumeUid]);

            expect(results).toHaveLength(2);
            expect(results[0].ok).toBe(true);
            expect(results[1].ok).toBe(true);
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(3 + 3); // main photo + related photo + missing related photo
            expect(apiService.addPhotosToAlbum).toHaveBeenCalledTimes(2); // two attempts
            expect(apiService.copyPhotoToAlbum).toHaveBeenCalledTimes(2); // two attempts
        });

        it('should notify correctly for both volumes', async () => {
            const sameVolumeUid = 'volume1~photo1';
            const differentVolumeUid = 'volume2~photo2';

            const results = await executeProcess([sameVolumeUid, differentVolumeUid]);

            expect(results).toHaveLength(2);
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledTimes(1);
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith(sameVolumeUid);
            expect(nodesService.notifyChildCreated).toHaveBeenCalledTimes(1);
            expect(nodesService.notifyChildCreated).toHaveBeenCalledWith('volume1~copiedvolume2~photo2');
        });
    });
});
