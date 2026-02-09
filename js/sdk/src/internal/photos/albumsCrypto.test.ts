import { DriveCrypto, PrivateKey, SessionKey } from '../../crypto';
import { NodeSigningKeys } from '../nodes/interface';
import { AlbumsCryptoService } from './albumsCrypto';

describe('AlbumsCryptoService', () => {
    let driveCrypto: DriveCrypto;
    let albumsCryptoService: AlbumsCryptoService;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {};

        albumsCryptoService = new AlbumsCryptoService(driveCrypto);
    });

    describe('createAlbum', () => {
        let parentKeys: any;

        beforeEach(() => {
            parentKeys = {
                key: 'parentKey' as any,
                hashKey: new Uint8Array([1, 2, 3]),
            };
            driveCrypto.generateKey = jest.fn().mockResolvedValue({
                encrypted: {
                    armoredKey: 'encryptedNodeKey',
                    armoredPassphrase: 'encryptedPassphrase',
                    armoredPassphraseSignature: 'passphraseSignature',
                },
                decrypted: {
                    key: 'nodeKey' as any,
                    passphrase: 'nodePassphrase',
                    passphraseSessionKey: 'passphraseSessionKey' as any,
                },
            });
            driveCrypto.encryptNodeName = jest.fn().mockResolvedValue({
                armoredNodeName: 'encryptedNodeName',
            });
            driveCrypto.generateLookupHash = jest.fn().mockResolvedValue('lookupHash');
            driveCrypto.generateHashKey = jest.fn().mockResolvedValue({
                armoredHashKey: 'encryptedHashKey',
                hashKey: new Uint8Array([4, 5, 6]),
            });
        });

        it('should encrypt new album with user address key', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            const result = await albumsCryptoService.createAlbum(parentKeys, signingKeys, 'My Album');

            expect(result).toEqual({
                encryptedCrypto: {
                    encryptedName: 'encryptedNodeName',
                    hash: 'lookupHash',
                    armoredKey: 'encryptedNodeKey',
                    armoredNodePassphrase: 'encryptedPassphrase',
                    armoredNodePassphraseSignature: 'passphraseSignature',
                    signatureEmail: 'test@example.com',
                    armoredHashKey: 'encryptedHashKey',
                },
                keys: {
                    passphrase: 'nodePassphrase',
                    key: 'nodeKey',
                    passphraseSessionKey: 'passphraseSessionKey',
                    hashKey: new Uint8Array([4, 5, 6]),
                },
            });

            expect(driveCrypto.generateKey).toHaveBeenCalledWith([parentKeys.key], signingKeys.key);
            expect(driveCrypto.encryptNodeName).toHaveBeenCalledWith(
                'My Album',
                undefined,
                parentKeys.key,
                signingKeys.key,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('My Album', parentKeys.hashKey);
            expect(driveCrypto.generateHashKey).toHaveBeenCalledWith('nodeKey');
        });

        it('should throw error when creating album by anonymous user', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'nodeKey',
                nodeKey: 'nodeSigningKey' as any,
                parentNodeKey: 'parentNodeKey' as any,
            };

            await expect(albumsCryptoService.createAlbum(parentKeys, signingKeys, 'My Album')).rejects.toThrow(
                'Creating album by anonymous user is not supported',
            );
        });
    });

    describe('renameAlbum', () => {
        let parentKeys: any;
        let nodeNameSessionKey: SessionKey;

        beforeEach(() => {
            parentKeys = {
                key: 'parentKey' as any,
                hashKey: new Uint8Array([1, 2, 3]),
            };
            nodeNameSessionKey = 'nameSessionKey' as any;
            driveCrypto.decryptSessionKey = jest.fn().mockResolvedValue(nodeNameSessionKey);
            driveCrypto.encryptNodeName = jest.fn().mockResolvedValue({
                armoredNodeName: 'encryptedNewNodeName',
            });
            driveCrypto.generateLookupHash = jest.fn().mockResolvedValue('newHash');
        });

        it('should encrypt new album name with user address key', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            const result = await albumsCryptoService.renameAlbum(
                parentKeys,
                'oldEncryptedName',
                signingKeys,
                'Renamed Album',
            );

            expect(result).toEqual({
                signatureEmail: 'test@example.com',
                armoredNodeName: 'encryptedNewNodeName',
                hash: 'newHash',
            });

            expect(driveCrypto.decryptSessionKey).toHaveBeenCalledWith('oldEncryptedName', parentKeys.key);
            expect(driveCrypto.encryptNodeName).toHaveBeenCalledWith(
                'Renamed Album',
                nodeNameSessionKey,
                parentKeys.key,
                signingKeys.key,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('Renamed Album', parentKeys.hashKey);
        });

        it('should throw error when renaming album by anonymous user', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'nodeKey',
                nodeKey: 'nodeSigningKey' as any,
                parentNodeKey: 'parentNodeKey' as any,
            };

            await expect(
                albumsCryptoService.renameAlbum(parentKeys, 'oldEncryptedName', signingKeys, 'Renamed Album'),
            ).rejects.toThrow('Renaming album by anonymous user is not supported');
        });

        it('should throw error when parent hash key is not available', async () => {
            const parentKeysWithoutHashKey = {
                key: 'parentKey' as any,
            };
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            await expect(
                albumsCryptoService.renameAlbum(
                    parentKeysWithoutHashKey,
                    'oldEncryptedName',
                    signingKeys,
                    'Renamed Album',
                ),
            ).rejects.toThrow('Cannot rename album: parent folder hash key not available');
        });
    });
});
