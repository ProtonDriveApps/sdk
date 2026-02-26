import { ValidationError } from '../../errors';
import { resultOk } from '../../interface';
import { AlbumsCryptoService } from './albumsCrypto';
import { DecryptedPhotoNode } from './interface';
import { PhotoTransferPayloadBuilder } from './photosTransferPayloadBuilder';
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

describe('PhotoTransferPayloadBuilder', () => {
    let cryptoService: jest.Mocked<AlbumsCryptoService>;
    let nodesService: jest.Mocked<PhotosNodesAccess>;
    let targetKeys: { key: unknown; hashKey: Uint8Array };
    let signingKeys: { type: 'userAddress'; email: string; addressId: string; key: unknown };
    let builder: PhotoTransferPayloadBuilder;

    beforeEach(() => {
        targetKeys = {
            key: 'targetKey' as any,
            hashKey: new Uint8Array([1, 2, 3]),
        };

        signingKeys = {
            type: 'userAddress',
            email: 'test@example.com',
            addressId: 'addressId',
            key: 'signingKey' as any,
        };

        // @ts-expect-error Mocking for testing purposes
        cryptoService = {
            encryptPhotoForAlbum: jest.fn(),
        };

        // @ts-expect-error Mocking for testing purposes
        nodesService = {
            iterateNodes: jest.fn(),
            getNodePrivateAndSessionKeys: jest.fn(),
        };

        builder = new PhotoTransferPayloadBuilder(cryptoService, nodesService);
    });

    describe('preparePhotoPayloads', () => {
        beforeEach(() => {
            nodesService.iterateNodes.mockImplementation(async function* (uids: string[]) {
                for (const uid of uids) {
                    if (uid === 'volume1~missing') {
                        yield { missingUid: uid };
                        continue;
                    }

                    const photoNode = createMockPhotoNode(uid);

                    // Handle uids in the form 'volumeId~mainPhoto-related:N' where N is the number of related photos
                    const relatedMatch = /^(.+)~(.+)-related:(\d+)$/.exec(uid);
                    if (relatedMatch) {
                        const [, volumeId, , countStr] = relatedMatch;
                        const count = parseInt(countStr, 10);
                        photoNode.photo!.relatedPhotoNodeUids = Array.from(
                            { length: count },
                            (_, idx) => `${volumeId}~related${idx + 1}`,
                        );
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
        });

        it('should return payloads and empty errors for a single photo without related photos', async () => {
            const items = [{ photoNodeUid: 'volume1~photo1' }];

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [{
                    nodeUid: 'volume1~photo1',
                    contentHash: 'contentHash',
                    nameHash: 'nameHash',
                    encryptedName: 'encryptedName',
                    nameSignatureEmail: 'test@example.com',
                    nodePassphrase: 'passphrase',
                    relatedPhotos: [],
                }],
                errors: new Map(),
            });
            expect(nodesService.iterateNodes).toHaveBeenCalledWith(['volume1~photo1'], undefined);
            expect(nodesService.getNodePrivateAndSessionKeys).toHaveBeenCalledWith('volume1~photo1');
            expect(cryptoService.encryptPhotoForAlbum).toHaveBeenCalledTimes(1);
        });

        it('should include related photos in payload when photo has relatedPhotoNodeUids', async () => {
            const items = [{ photoNodeUid: 'volume1~mainPhoto-related:3' }];

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [{
                    nodeUid: 'volume1~mainPhoto-related:3',
                    contentHash: 'contentHash',
                    nameHash: 'nameHash',
                    encryptedName: 'encryptedName',
                    nameSignatureEmail: 'test@example.com',
                    nodePassphrase: 'passphrase',
                    relatedPhotos: [{
                        nodeUid: 'volume1~related1',
                        contentHash: 'contentHash',
                        nameHash: 'nameHash',
                        encryptedName: 'encryptedName',
                        nameSignatureEmail: 'test@example.com',
                        nodePassphrase: 'passphrase',
                    }, {
                        nodeUid: 'volume1~related2',
                        contentHash: 'contentHash',
                        nameHash: 'nameHash',
                        encryptedName: 'encryptedName',
                        nameSignatureEmail: 'test@example.com',
                        nodePassphrase: 'passphrase',
                    }, {
                        nodeUid: 'volume1~related3',
                        contentHash: 'contentHash',
                        nameHash: 'nameHash',
                        encryptedName: 'encryptedName',
                        nameSignatureEmail: 'test@example.com',
                        nodePassphrase: 'passphrase',
                    }],
                }],
                errors: new Map(),
            });
            expect(nodesService.iterateNodes).toHaveBeenCalledTimes(2);
            expect(nodesService.iterateNodes).toHaveBeenNthCalledWith(1, ['volume1~mainPhoto-related:3'], undefined);
            expect(nodesService.iterateNodes).toHaveBeenNthCalledWith(
                2,
                ['volume1~related1', 'volume1~related2', 'volume1~related3'],
                undefined,
            );
            expect(cryptoService.encryptPhotoForAlbum).toHaveBeenCalledTimes(4);
        });

        it('should merge additionalRelatedPhotoNodeUids with photo relatedPhotoNodeUids', async () => {
            const items = [
                {
                    photoNodeUid: 'volume1~photo1',
                    additionalRelatedPhotoNodeUids: ['volume1~extraRelated1'],
                },
            ];

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [{
                    nodeUid: 'volume1~photo1',
                    contentHash: 'contentHash',
                    nameHash: 'nameHash',
                    encryptedName: 'encryptedName',
                    nameSignatureEmail: 'test@example.com',
                    nodePassphrase: 'passphrase',
                    relatedPhotos: [{
                        nodeUid: 'volume1~extraRelated1',
                        contentHash: 'contentHash',
                        nameHash: 'nameHash',
                        encryptedName: 'encryptedName',
                        nameSignatureEmail: 'test@example.com',
                        nodePassphrase: 'passphrase',
                    }],
                }],
                errors: new Map(),
            });
        });

        it('should put missing node UIDs in errors with ValidationError', async () => {
            const items = [
                { photoNodeUid: 'volume1~photo1' },
                { photoNodeUid: 'volume1~missing' },
            ];

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [{
                    nodeUid: 'volume1~photo1',
                    contentHash: 'contentHash',
                    nameHash: 'nameHash',
                    encryptedName: 'encryptedName',
                    nameSignatureEmail: 'test@example.com',
                    nodePassphrase: 'passphrase',
                    relatedPhotos: [],
                }],
                errors: new Map([['volume1~missing', new ValidationError('Photo not found')]]),
            });
        });

        it('should throw when targetKeys.hashKey is missing', async () => {
            const items = [{ photoNodeUid: 'volume1~photo1' }];
            const keysWithoutHashKey = { ...targetKeys, hashKey: undefined };

            await expect(
                builder.preparePhotoPayloads(items, 'volume1~root', keysWithoutHashKey as any, signingKeys as any),
            ).rejects.toThrow('Target hash key is required to build photo payloads');

            expect(nodesService.iterateNodes).not.toHaveBeenCalled();
        });

        it('should put error in errors map when encryptPhotoForAlbum fails', async () => {
            const items = [{ photoNodeUid: 'volume1~photo1' }];
            const cryptoError = new Error('Crypto operation failed');
            cryptoService.encryptPhotoForAlbum.mockRejectedValue(cryptoError);

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                        targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [],
                errors: new Map([['volume1~photo1', cryptoError]]),
            });
        });

        it('should put error in errors map when getNodePrivateAndSessionKeys fails', async () => {
            const items = [{ photoNodeUid: 'volume1~photo1' }];
            const keysError = new Error('Failed to get keys');
            nodesService.getNodePrivateAndSessionKeys.mockRejectedValue(keysError);

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [],
                errors: new Map([['volume1~photo1', keysError]]),
            });
        });

        it('should put error in errors map when photo has no content hash', async () => {
            const items = [{ photoNodeUid: 'volume1~photo1' }];
            nodesService.iterateNodes.mockImplementation(async function* (uids: string[]) {
                const node = createMockPhotoNode(uids[0]);
                node.activeRevision = { ok: true, value: { ...(node.activeRevision as any).value, claimedDigests: {} } } as any;
                yield node;
            });

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [],
                errors: new Map([['volume1~photo1', new Error('Cannot build photo payload without a content hash')]]),
            });
        });

        it('should include signatureEmail and nodePassphraseSignature only for anonymous key author', async () => {
            const items = [{ photoNodeUid: 'volume1~anonymous' }, { photoNodeUid: 'volume1~signed' }];
            nodesService.iterateNodes.mockImplementation(async function* (uids: string[]) {
                for (const uid of uids) {
                    const node = createMockPhotoNode(uid);
                    if (uid === 'volume1~anonymous') {
                        node.keyAuthor = { ok: true, value: null };
                    } else {
                        node.keyAuthor = { ok: true, value: 'test@example.com' };
                    }
                    yield node;
                }
            });

            const result = await builder.preparePhotoPayloads(
                items,
                'volume1~root',
                targetKeys as any,
                signingKeys as any,
            );

            expect(result).toMatchObject({
                payloads: [{
                    nodeUid: 'volume1~anonymous',
                    contentHash: 'contentHash',
                    nameHash: 'nameHash',
                    encryptedName: 'encryptedName',
                    nameSignatureEmail: 'test@example.com',
                    nodePassphrase: 'passphrase',
                    signatureEmail: 'test@example.com',
                    nodePassphraseSignature: 'signature',
                    relatedPhotos: [],
                }, {
                    nodeUid: 'volume1~signed',
                    contentHash: 'contentHash',
                    nameHash: 'nameHash',
                    encryptedName: 'encryptedName',
                    nameSignatureEmail: 'test@example.com',
                    nodePassphrase: 'passphrase',
                    relatedPhotos: [],
                }],
                errors: new Map(),
            });
        });
    });
});
