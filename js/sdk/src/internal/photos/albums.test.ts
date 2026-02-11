import { NodeType, MemberRole } from '../../interface';
import { ValidationError } from '../../errors';
import { Albums } from './albums';
import { AlbumsCryptoService } from './albumsCrypto';
import { PhotosAPIService } from './apiService';
import { DecryptedPhotoNode } from './interface';
import { PhotosNodesAccess } from './nodes';
import { PhotoSharesManager } from './shares';

describe('Albums', () => {
    let apiService: PhotosAPIService;
    let cryptoService: AlbumsCryptoService;
    let photoShares: PhotoSharesManager;
    let nodesService: PhotosNodesAccess;
    let albums: Albums;

    let nodes: { [uid: string]: DecryptedPhotoNode };

    beforeEach(() => {
        nodes = {
            rootNodeUid: {
                uid: 'rootNodeUid',
                parentUid: '',
                hash: 'rootHash',
            } as DecryptedPhotoNode,
            albumNodeUid: {
                uid: 'albumNodeUid',
                parentUid: 'rootNodeUid',
                name: { ok: true, value: 'old album name' },
                hash: 'albumHash',
                encryptedName: 'encryptedAlbumName',
            } as DecryptedPhotoNode,
        };

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            createAlbum: jest.fn().mockResolvedValue('volumeId~newAlbumNodeId'),
            updateAlbum: jest.fn(),
            deleteAlbum: jest.fn(),
            removePhotosFromAlbum: jest.fn(),
        };

        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            createAlbum: jest.fn().mockResolvedValue({
                encryptedCrypto: {
                    encryptedName: 'newEncryptedAlbumName',
                    hash: 'newAlbumHash',
                    armoredKey: 'armoredKey',
                    armoredNodePassphrase: 'armoredNodePassphrase',
                    armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
                    signatureEmail: 'signature@example.com',
                    armoredHashKey: 'armoredHashKey',
                },
                keys: {
                    passphrase: 'passphrase',
                    key: 'nodeKey',
                    passphraseSessionKey: 'passphraseSessionKey',
                    hashKey: new Uint8Array([1, 2, 3]),
                },
            }),
            renameAlbum: jest.fn().mockResolvedValue({
                signatureEmail: 'newSignatureEmail',
                armoredNodeName: 'newArmoredAlbumName',
                hash: 'newHash',
            }),
        };

        // @ts-expect-error No need to implement all methods for mocking
        photoShares = {
            getRootIDs: jest.fn().mockResolvedValue({ volumeId: 'volumeId', rootNodeId: 'rootNodeId' }),
        };

        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {
            getVolumeRootFolder: jest.fn().mockResolvedValue(nodes.rootNodeUid),
            getNode: jest.fn().mockImplementation((uid: string) => nodes[uid]),
            getNodeKeys: jest.fn().mockImplementation((uid) => ({
                key: `${uid}-key`,
                hashKey: `${uid}-hashKey`,
                passphrase: `${uid}-passphrase`,
                passphraseSessionKey: `${uid}-passphraseSessionKey`,
            })),
            getParentKeys: jest.fn().mockImplementation(({ parentUid }) => ({
                key: `${parentUid}-key`,
                hashKey: `${parentUid}-hashKey`,
            })),
            getNodeSigningKeys: jest.fn().mockResolvedValue({
                type: 'userAddress',
                email: 'user@example.com',
                addressId: 'addressId',
                key: 'addressKey',
            }),
            notifyNodeChanged: jest.fn(),
            notifyNodeDeleted: jest.fn(),
            notifyChildCreated: jest.fn(),
        };

        albums = new Albums(apiService, cryptoService, photoShares, nodesService);
    });

    describe('createAlbum', () => {
        it('creates album and returns decrypted node', async () => {
            const newAlbum = await albums.createAlbum('My New Album');

            expect(newAlbum).toEqual(
                expect.objectContaining({
                    uid: 'volumeId~newAlbumNodeId',
                    parentUid: 'rootNodeUid',
                    type: NodeType.Album,
                    mediaType: 'Album',
                    name: { ok: true, value: 'My New Album' },
                    hash: 'newAlbumHash',
                    encryptedName: 'newEncryptedAlbumName',
                    keyAuthor: { ok: true, value: 'signature@example.com' },
                    nameAuthor: { ok: true, value: 'signature@example.com' },
                }),
            );

            expect(nodesService.getNodeSigningKeys).toHaveBeenCalledWith({ parentNodeUid: 'rootNodeUid' });
            expect(cryptoService.createAlbum).toHaveBeenCalledWith(
                { key: 'rootNodeUid-key', hashKey: 'rootNodeUid-hashKey' },
                { type: 'userAddress', email: 'user@example.com', addressId: 'addressId', key: 'addressKey' },
                'My New Album',
            );
            expect(apiService.createAlbum).toHaveBeenCalledWith('rootNodeUid', {
                encryptedName: 'newEncryptedAlbumName',
                hash: 'newAlbumHash',
                armoredKey: 'armoredKey',
                armoredNodePassphrase: 'armoredNodePassphrase',
                armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
                signatureEmail: 'signature@example.com',
                armoredHashKey: 'armoredHashKey',
            });
            expect(nodesService.notifyChildCreated).toHaveBeenCalledWith('rootNodeUid');
        });

        it('throws validation error for invalid album name', async () => {
            await expect(albums.createAlbum('invalid/name')).rejects.toThrow(ValidationError);
        });

        it('throws error when parent hash key is not available', async () => {
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({
                key: 'rootNodeUid-key',
                hashKey: undefined,
            });

            await expect(albums.createAlbum('My Album')).rejects.toThrow(
                'Cannot create album: parent folder hash key not available',
            );
        });
    });

    describe('updateAlbum', () => {
        it('updates album name and notifies cache', async () => {
            const updatedAlbum = await albums.updateAlbum('albumNodeUid', { name: 'new album name' });

            expect(updatedAlbum).toEqual({
                ...nodes.albumNodeUid,
                name: { ok: true, value: 'new album name' },
                encryptedName: 'newArmoredAlbumName',
                nameAuthor: { ok: true, value: 'newSignatureEmail' },
                hash: 'newHash',
            });
            expect(nodesService.getNodeSigningKeys).toHaveBeenCalledWith({
                nodeUid: 'albumNodeUid',
                parentNodeUid: 'rootNodeUid',
            });
            expect(cryptoService.renameAlbum).toHaveBeenCalledWith(
                { key: 'rootNodeUid-key', hashKey: 'rootNodeUid-hashKey' },
                'encryptedAlbumName',
                { type: 'userAddress', email: 'user@example.com', addressId: 'addressId', key: 'addressKey' },
                'new album name',
            );
            expect(apiService.updateAlbum).toHaveBeenCalledWith(
                'albumNodeUid',
                undefined,
                {
                    encryptedName: 'newArmoredAlbumName',
                    hash: 'newHash',
                    originalHash: 'albumHash',
                    nameSignatureEmail: 'newSignatureEmail',
                },
            );
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('albumNodeUid');
        });

        it('updates album cover photo only', async () => {
            const updatedAlbum = await albums.updateAlbum('albumNodeUid', { coverPhotoNodeUid: 'photoNodeUid' });

            expect(updatedAlbum).toEqual(nodes.albumNodeUid);
            expect(cryptoService.renameAlbum).not.toHaveBeenCalled();
            expect(apiService.updateAlbum).toHaveBeenCalledWith('albumNodeUid', 'photoNodeUid', undefined);
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('albumNodeUid');
        });

        it('updates album name and cover photo together', async () => {
            const updatedAlbum = await albums.updateAlbum('albumNodeUid', {
                name: 'new album name',
                coverPhotoNodeUid: 'photoNodeUid',
            });

            expect(updatedAlbum).toEqual({
                ...nodes.albumNodeUid,
                name: { ok: true, value: 'new album name' },
                encryptedName: 'newArmoredAlbumName',
                nameAuthor: { ok: true, value: 'newSignatureEmail' },
                hash: 'newHash',
            });
            expect(apiService.updateAlbum).toHaveBeenCalledWith(
                'albumNodeUid',
                'photoNodeUid',
                {
                    encryptedName: 'newArmoredAlbumName',
                    hash: 'newHash',
                    originalHash: 'albumHash',
                    nameSignatureEmail: 'newSignatureEmail',
                },
            );
        });

        it('throws validation error for invalid album name', async () => {
            await expect(albums.updateAlbum('albumNodeUid', { name: 'invalid/name' })).rejects.toThrow(ValidationError);
        });
    });

    describe('deleteAlbum', () => {
        it('deletes album and notifies cache', async () => {
            await albums.deleteAlbum('albumNodeUid');

            expect(apiService.deleteAlbum).toHaveBeenCalledWith('albumNodeUid', {});
            expect(nodesService.notifyNodeDeleted).toHaveBeenCalledWith('albumNodeUid');
        });

        it('deletes album with force option', async () => {
            await albums.deleteAlbum('albumNodeUid', { force: true });

            expect(apiService.deleteAlbum).toHaveBeenCalledWith('albumNodeUid', { force: true });
            expect(nodesService.notifyNodeDeleted).toHaveBeenCalledWith('albumNodeUid');
        });
    });

    describe('removePhotos', () => {
        it('notifies nodes service only for successfully removed photos', async () => {
            apiService.removePhotosFromAlbum = jest.fn().mockImplementation(async function* () {
                yield { uid: 'photo1', ok: true };
                yield { uid: 'photo2', ok: false, error: 'Some error' };
                yield { uid: 'photo3', ok: true };
            });

            const results = [];
            for await (const result of albums.removePhotos('albumNodeUid', ['photo1', 'photo2', 'photo3'])) {
                results.push(result);
            }

            expect(results).toEqual([
                { uid: 'photo1', ok: true },
                { uid: 'photo2', ok: false, error: 'Some error' },
                { uid: 'photo3', ok: true },
            ]);
            expect(apiService.removePhotosFromAlbum).toHaveBeenCalledWith('albumNodeUid', ['photo1', 'photo2', 'photo3'], undefined);
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledTimes(2);
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('photo1');
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('photo3');
            expect(nodesService.notifyNodeChanged).not.toHaveBeenCalledWith('photo2');
        });
    });
});
