import { ValidationError } from '../../errors';
import { ProtonDriveTelemetry, ThumbnailType, UploadMetadata } from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import { ErrorCode } from '../apiService';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';
import { NodesService } from './interface';
import { UploadManager } from './manager';

describe('UploadManager', () => {
    let telemetry: ProtonDriveTelemetry;
    let apiService: UploadAPIService;
    let cryptoService: UploadCryptoService;
    let nodesService: NodesService;

    let manager: UploadManager;

    const clientUid = 'clientUid';

    beforeEach(() => {
        telemetry = getMockTelemetry();
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            createDraft: jest.fn().mockResolvedValue({
                nodeUid: 'newNode:nodeUid',
                nodeRevisionUid: 'newNode:nodeRevisionUid',
            }),
            deleteDraft: jest.fn(),
            commitDraftRevision: jest.fn(),
            uploadSmallFile: jest.fn().mockResolvedValue({
                nodeUid: 'uploaded:nodeUid',
                nodeRevisionUid: 'uploaded:nodeRevisionUid',
            }),
            uploadSmallRevision: jest.fn().mockResolvedValue({
                nodeUid: 'revised:nodeUid',
                nodeRevisionUid: 'revised:nodeRevisionUid',
            }),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            generateFileCrypto: jest.fn().mockResolvedValue({
                nodeKeys: {
                    decrypted: { key: 'newNode:key' },
                    encrypted: {
                        armoredKey: 'newNode:armoredKey',
                        armoredPassphrase: 'newNode:armoredPassphrase',
                        armoredPassphraseSignature: 'newNode:armoredPassphraseSignature',
                    },
                },
                contentKey: {
                    decrypted: { contentKeyPacketSessionKey: 'newNode:ContentKeyPacketSessionKey' },
                    encrypted: {
                        base64ContentKeyPacket: 'newNode:base64ContentKeyPacket',
                        armoredContentKeyPacketSignature: 'newNode:armoredContentKeyPacketSignature',
                    },
                },
                encryptedNode: {
                    encryptedName: 'newNode:encryptedName',
                    hash: 'newNode:hash',
                },
                signingKeys: {
                    email: 'signatureEmail',
                },
            }),
            commitFile: jest.fn().mockResolvedValue({
                armoredManifestSignature: 'newNode:armoredManifestSignature',
                signatureEmail: 'signatureEmail',
                armoredExtendedAttributes: 'newNode:armoredExtendedAttributes',
            }),
            getSigningKeysForExistingNode: jest.fn().mockResolvedValue({
                email: 'signatureEmail',
                addressId: 'addressId',
                nameAndPassphraseSigningKey: {} as any,
                contentSigningKey: {} as any,
            }),
        };
        nodesService = {
            getNode: jest.fn(async (nodeUid: string) => ({
                uid: nodeUid,
                parentUid: 'parentUid',
            })),
            getNodeKeys: jest.fn().mockResolvedValue({
                hashKey: 'parentNode:hashKey',
                key: 'parentNode:nodekey',
            }),
            getNodeSigningKeys: jest.fn().mockResolvedValue({
                type: 'userAddress',
                email: 'signatureEmail',
                addressId: 'addressId',
            }),
            notifyChildCreated: jest.fn(),
            notifyNodeChanged: jest.fn(),
        };

        manager = new UploadManager(telemetry, apiService, cryptoService, nodesService, clientUid);
    });

    describe('createDraftNode', () => {
        it('should fail to create node in non-folder parent', async () => {
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({ hashKey: undefined });

            const result = manager.createDraftNode('parentUid', 'name', {} as UploadMetadata);
            await expect(result).rejects.toThrow('Creating files in non-folders is not allowed');
        });

        it('should create draft node', async () => {
            const result = await manager.createDraftNode('parentUid', 'name', {
                mediaType: 'myMimeType',
                expectedSize: 123456,
            } as UploadMetadata);

            expect(result).toEqual({
                nodeUid: 'newNode:nodeUid',
                nodeRevisionUid: 'newNode:nodeRevisionUid',
                nodeKeys: {
                    key: 'newNode:key',
                    contentKeyPacketSessionKey: 'newNode:ContentKeyPacketSessionKey',
                    signingKeys: {
                        email: 'signatureEmail',
                    },
                },
                parentNodeKeys: {
                    hashKey: 'parentNode:hashKey',
                },
                newNodeInfo: {
                    parentUid: 'parentUid',
                    name: 'name',
                    encryptedName: 'newNode:encryptedName',
                    hash: 'newNode:hash',
                },
            });
            expect(apiService.createDraft).toHaveBeenCalledWith('parentUid', {
                armoredEncryptedName: 'newNode:encryptedName',
                hash: 'newNode:hash',
                mediaType: 'myMimeType',
                intendedUploadSize: 123456,
                armoredNodeKey: 'newNode:armoredKey',
                armoredNodePassphrase: 'newNode:armoredPassphrase',
                armoredNodePassphraseSignature: 'newNode:armoredPassphraseSignature',
                base64ContentKeyPacket: 'newNode:base64ContentKeyPacket',
                armoredContentKeyPacketSignature: 'newNode:armoredContentKeyPacketSignature',
                signatureEmail: 'signatureEmail',
            });
        });

        it('should delete existing draft and trying again', async () => {
            let firstCall = true;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (firstCall) {
                    firstCall = false;
                    throw new ValidationError('Draft already exists', ErrorCode.ALREADY_EXISTS, {
                        ConflictLinkID: 'existingLinkId',
                        ConflictDraftRevisionID: 'existingDraftRevisionId',
                        ConflictDraftClientUID: clientUid,
                    });
                }
                return {
                    nodeUid: 'newNode:nodeUid',
                    nodeRevisionUid: 'newNode:nodeRevisionUid',
                };
            });

            const result = await manager.createDraftNode('volumeId~parentUid', 'name', {} as UploadMetadata);

            expect(result).toEqual({
                nodeUid: 'newNode:nodeUid',
                nodeRevisionUid: 'newNode:nodeRevisionUid',
                nodeKeys: {
                    key: 'newNode:key',
                    contentKeyPacketSessionKey: 'newNode:ContentKeyPacketSessionKey',
                    signingKeys: {
                        email: 'signatureEmail',
                    },
                },
                parentNodeKeys: {
                    hashKey: 'parentNode:hashKey',
                },
                newNodeInfo: {
                    parentUid: 'volumeId~parentUid',
                    name: 'name',
                    encryptedName: 'newNode:encryptedName',
                    hash: 'newNode:hash',
                },
            });
            expect(apiService.deleteDraft).toHaveBeenCalledTimes(1);
            expect(apiService.deleteDraft).toHaveBeenCalledWith('volumeId~existingLinkId');
        });

        it('should not delete existing draft if client UID does not match', async () => {
            let firstCall = true;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (firstCall) {
                    firstCall = false;
                    throw new ValidationError('Draft already exists', ErrorCode.ALREADY_EXISTS, {
                        ConflictLinkID: 'existingLinkId',
                        ConflictDraftRevisionID: 'existingDraftRevisionId',
                        ConflictDraftClientUID: 'anotherClientUid',
                    });
                }
                return {
                    nodeUid: 'newNode:nodeUid',
                    nodeRevisionUid: 'newNode:nodeRevisionUid',
                };
            });

            const promise = manager.createDraftNode('volumeId~parentUid', 'name', {} as UploadMetadata);

            try {
                await promise;
            } catch (error: any) {
                expect(error.message).toBe('Draft already exists');
                expect(error.isUnfinishedUpload).toBe(true);
            }
            expect(apiService.deleteDraft).not.toHaveBeenCalled();
        });

        it('should not delete existing draft if client UID is not set', async () => {
            const clientUid = undefined;
            manager = new UploadManager(telemetry, apiService, cryptoService, nodesService, clientUid);

            let firstCall = true;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (firstCall) {
                    firstCall = false;
                    throw new ValidationError('Draft already exists', ErrorCode.ALREADY_EXISTS, {
                        ConflictLinkID: 'existingLinkId',
                        ConflictDraftRevisionID: 'existingDraftRevisionId',
                        ConflictDraftClientUID: clientUid,
                    });
                }
                return {
                    nodeUid: 'newNode:nodeUid',
                    nodeRevisionUid: 'newNode:nodeRevisionUid',
                };
            });

            const promise = manager.createDraftNode('volumeId~parentUid', 'name', {} as UploadMetadata);

            try {
                await promise;
            } catch (error: any) {
                expect(error.message).toBe('Draft already exists');
                expect(error.isUnfinishedUpload).toBe(true);
            }
            expect(apiService.deleteDraft).not.toHaveBeenCalled();
        });

        it('should handle error when deleting existing draft', async () => {
            let firstCall = true;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (firstCall) {
                    firstCall = false;
                    throw new ValidationError('Draft already exists', ErrorCode.ALREADY_EXISTS, {
                        ConflictLinkID: 'existingLinkId',
                        ConflictDraftRevisionID: 'existingDraftRevisionId',
                        ConflictDraftClientUID: clientUid,
                    });
                }
                return {
                    nodeUid: 'newNode:nodeUid',
                    nodeRevisionUid: 'newNode:nodeRevisionUid',
                };
            });
            apiService.deleteDraft = jest.fn().mockImplementation(() => {
                throw new Error('Failed to delete draft');
            });

            const result = manager.createDraftNode('volumeId~parentUid', 'name', {} as UploadMetadata);

            try {
                await result;
            } catch (error: any) {
                expect(error.message).toBe('Draft already exists');
                expect(error.existingNodeUid).toBe('volumeId~existingLinkId');
            }
            expect(apiService.deleteDraft).toHaveBeenCalledTimes(1);
        });
    });

    describe('generateNewFileCrypto', () => {
        it('should throw when parent is not a folder (no hashKey)', async () => {
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({ hashKey: undefined });

            const result = manager.generateNewFileCrypto('parentUid', 'fileName');

            await expect(result).rejects.toThrow('Creating files in non-folders is not allowed');
            expect(nodesService.getNodeKeys).toHaveBeenCalledWith('parentUid');
            expect(cryptoService.generateFileCrypto).not.toHaveBeenCalled();
        });

        it('should return generated crypto with parentHashKey when parent is folder', async () => {
            const result = await manager.generateNewFileCrypto('parentUid', 'fileName');

            expect(nodesService.getNodeKeys).toHaveBeenCalledWith('parentUid');
            expect(cryptoService.generateFileCrypto).toHaveBeenCalledWith(
                'parentUid',
                { key: 'parentNode:nodekey', hashKey: 'parentNode:hashKey' },
                'fileName',
            );
            expect(result).toMatchObject({
                parentHashKey: 'parentNode:hashKey',
                encryptedNode: { encryptedName: 'newNode:encryptedName', hash: 'newNode:hash' },
                nodeKeys: expect.anything(),
                contentKey: expect.anything(),
                signingKeys: { email: 'signatureEmail' },
            });
        });
    });

    describe('getExistingFileNodeCrypto', () => {
        it('should throw when node has no active revision', async () => {
            nodesService.getNode = jest.fn().mockResolvedValue({
                uid: 'fileNodeUid',
                parentUid: 'parentUid',
                activeRevision: { ok: false, error: new Error('No revision') },
            });

            const result = manager.getExistingFileNodeCrypto('fileNodeUid');

            await expect(result).rejects.toThrow('Creating revisions in non-files is not allowed');
        });

        it('should throw when nodeKeys has no contentKeyPacketSessionKey', async () => {
            nodesService.getNode = jest.fn().mockResolvedValue({
                uid: 'fileNodeUid',
                parentUid: 'parentUid',
                activeRevision: { ok: true, value: { uid: 'revisionUid' } },
            });
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({
                key: 'nodeKey',
                contentKeyPacket: new Uint8Array([1, 2, 3]),
                hashKey: 'hashKey',
            });

            const result = manager.getExistingFileNodeCrypto('fileNodeUid');

            await expect(result).rejects.toThrow('Creating revisions in non-files is not allowed');
        });

        it('should throw when nodeKeys has no contentKeyPacket', async () => {
            nodesService.getNode = jest.fn().mockResolvedValue({
                uid: 'fileNodeUid',
                parentUid: 'parentUid',
                activeRevision: { ok: true, value: { uid: 'revisionUid' } },
            });
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({
                key: 'nodeKey',
                contentKeyPacketSessionKey: 'sessionKey',
                hashKey: 'hashKey',
            });

            const result = manager.getExistingFileNodeCrypto('fileNodeUid');

            await expect(result).rejects.toThrow('Content key packet is required for small revision upload');
        });

        it('should return key, contentKeyPacket, contentKeyPacketSessionKey and signingKeys', async () => {
            const contentKeyPacket = new Uint8Array([1, 2, 3]);
            nodesService.getNode = jest.fn().mockResolvedValue({
                uid: 'fileNodeUid',
                parentUid: 'parentUid',
                activeRevision: { ok: true, value: { uid: 'revisionUid' } },
            });
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({
                key: 'nodeKey',
                contentKeyPacket,
                contentKeyPacketSessionKey: 'sessionKey',
                hashKey: 'hashKey',
            });

            const result = await manager.getExistingFileNodeCrypto('fileNodeUid');

            expect(cryptoService.getSigningKeysForExistingNode).toHaveBeenCalledWith({
                nodeUid: 'fileNodeUid',
                parentNodeUid: 'parentUid',
            });
            expect(result).toEqual({
                key: 'nodeKey',
                contentKeyPacket,
                contentKeyPacketSessionKey: 'sessionKey',
                signingKeys: {
                    email: 'signatureEmail',
                    addressId: 'addressId',
                    nameAndPassphraseSigningKey: {},
                    contentSigningKey: {},
                },
            });
        });
    });

    describe('uploadFile', () => {
        const nodeCrypto = {
            encryptedNode: { encryptedName: 'encName', hash: 'hash' },
            nodeKeys: {
                encrypted: {
                    armoredKey: 'armoredKey',
                    armoredPassphrase: 'armoredPassphrase',
                    armoredPassphraseSignature: 'armoredPassphraseSignature',
                },
            },
            contentKey: {
                encrypted: {
                    base64ContentKeyPacket: 'base64ContentKeyPacket',
                    armoredContentKeyPacketSignature: 'armoredContentKeyPacketSignature',
                },
            },
            signingKeys: { email: 'signatureEmail' },
        } as any;
        const metadata = { mediaType: 'application/octet-stream', expectedSize: 100 } as UploadMetadata;
        const commitPayload = {
            armoredManifestSignature: 'manifestSignature',
            armoredExtendedAttributes: 'extAttr',
        };
        const encryptedBlock = {
            encryptedData: new Uint8Array([1, 2, 3]),
            armoredSignature: 'blockSig',
            verificationToken: new Uint8Array([4, 5, 6]),
        };
        const encryptedThumbnails = [{ type: ThumbnailType.Type1, encryptedData: new Uint8Array([7, 8, 9]) }];

        it('should call uploadSmallFile and notifyChildCreated on success', async () => {
            const result = await manager.uploadFile(
                'parentUid',
                nodeCrypto,
                metadata,
                commitPayload,
                encryptedBlock,
                encryptedThumbnails,
            );

            expect(result).toEqual({
                nodeUid: 'uploaded:nodeUid',
                nodeRevisionUid: 'uploaded:nodeRevisionUid',
            });
            expect(apiService.uploadSmallFile).toHaveBeenCalledWith(
                'parentUid',
                {
                    armoredEncryptedName: 'encName',
                    hash: 'hash',
                    mediaType: 'application/octet-stream',
                    armoredNodeKey: 'armoredKey',
                    armoredNodePassphrase: 'armoredPassphrase',
                    armoredNodePassphraseSignature: 'armoredPassphraseSignature',
                    base64ContentKeyPacket: 'base64ContentKeyPacket',
                    armoredContentKeyPacketSignature: 'armoredContentKeyPacketSignature',
                    armoredExtendedAttributes: 'extAttr',
                    signatureEmail: 'signatureEmail',
                },
                {
                    armoredManifestSignature: 'manifestSignature',
                    block: encryptedBlock,
                    thumbnails: encryptedThumbnails,
                },
                undefined,
            );
            expect(nodesService.notifyChildCreated).toHaveBeenCalledWith('parentUid');
        });

        it('should delete existing draft and retry on ALREADY_EXISTS when own draft', async () => {
            let firstCall = true;
            apiService.uploadSmallFile = jest.fn().mockImplementation(() => {
                if (firstCall) {
                    firstCall = false;
                    throw new ValidationError('Already exists', ErrorCode.ALREADY_EXISTS, {
                        ConflictLinkID: 'existingLinkId',
                        ConflictDraftRevisionID: 'existingDraftRevisionId',
                        ConflictDraftClientUID: clientUid,
                    });
                }
                return {
                    nodeUid: 'uploaded:nodeUid',
                    nodeRevisionUid: 'uploaded:nodeRevisionUid',
                };
            });

            const result = await manager.uploadFile(
                'volumeId~parentUid',
                nodeCrypto,
                { ...metadata, overrideExistingDraftByOtherClient: false },
                commitPayload,
                encryptedBlock,
                encryptedThumbnails,
            );

            expect(result).toEqual({
                nodeUid: 'uploaded:nodeUid',
                nodeRevisionUid: 'uploaded:nodeRevisionUid',
            });
            expect(apiService.deleteDraft).toHaveBeenCalledWith('volumeId~existingLinkId');
            expect(apiService.uploadSmallFile).toHaveBeenCalledTimes(2);
        });
    });

    describe('uploadSmallRevision', () => {
        const nodeCrypto = { signingKeys: { email: 'signatureEmail' } } as any;
        const commitPayload = {
            armoredManifestSignature: 'manifestSig',
            armoredExtendedAttributes: 'extAttr',
        };
        const encryptedBlock = {
            encryptedData: new Uint8Array([1, 2, 3]),
            armoredSignature: 'blockSig',
            verificationToken: new Uint8Array([4, 5, 6]),
        };
        const encryptedThumbnails = [{ type: ThumbnailType.Type1, encryptedData: new Uint8Array([7, 8, 9]) }];

        it('should throw when file has no revision', async () => {
            nodesService.getNode = jest.fn().mockResolvedValue({
                uid: 'fileNodeUid',
                parentUid: 'parentUid',
                activeRevision: { ok: false, error: new Error('No revision') },
            });

            const result = manager.uploadSmallRevision(
                'fileNodeUid',
                nodeCrypto,
                commitPayload,
                encryptedBlock,
                encryptedThumbnails,
            );

            await expect(result).rejects.toThrow('File has no revision');
            expect(apiService.uploadSmallRevision).not.toHaveBeenCalled();
        });

        it('should call uploadSmallRevision and notifyNodeChanged on success', async () => {
            nodesService.getNode = jest.fn().mockResolvedValue({
                uid: 'fileNodeUid',
                parentUid: 'parentUid',
                activeRevision: { ok: true, value: { uid: 'currentRevisionUid' } },
            });

            const result = await manager.uploadSmallRevision(
                'fileNodeUid',
                nodeCrypto,
                commitPayload,
                encryptedBlock,
                encryptedThumbnails,
            );

            expect(result).toEqual({
                nodeUid: 'revised:nodeUid',
                nodeRevisionUid: 'revised:nodeRevisionUid',
            });
            expect(apiService.uploadSmallRevision).toHaveBeenCalledWith(
                'fileNodeUid',
                'currentRevisionUid',
                {
                    signatureEmail: 'signatureEmail',
                    armoredExtendedAttributes: 'extAttr',
                },
                {
                    armoredManifestSignature: 'manifestSig',
                    block: encryptedBlock,
                    thumbnails: encryptedThumbnails,
                },
                undefined,
            );
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('fileNodeUid');
        });
    });

    describe('commit draft', () => {
        const nodeRevisionDraft = {
            nodeUid: 'newNode:nodeUid',
            nodeRevisionUid: 'newNode:nodeRevisionUid',
            nodeKeys: {
                key: { _idx: 32321 },
                contentKeyPacketSessionKey: 'newNode:contentKeyPacketSessionKey',
                signatureAddress: {
                    email: 'signatureEmail',
                    addressId: 'addressId',
                    addressKey: 'addressKey',
                } as any,
            },
        };
        const manifest = new Uint8Array([1, 2, 3]);
        const extendedAttributes = {
            modificationTime: new Date(),
            size: 123,
            blockSizes: [100, 20, 3],
            digests: {
                sha1: 'sha1',
            },
        };

        it('should commit revision draft', async () => {
            await manager.commitDraft(nodeRevisionDraft as any, manifest, extendedAttributes);

            expect(cryptoService.commitFile).toHaveBeenCalledWith(
                nodeRevisionDraft.nodeKeys,
                manifest,
                expect.anything(),
            );
            expect(apiService.commitDraftRevision).toHaveBeenCalledWith(
                nodeRevisionDraft.nodeRevisionUid,
                expect.anything(),
            );
            expect(nodesService.notifyNodeChanged).toHaveBeenCalledWith('newNode:nodeUid');
            expect(nodesService.notifyChildCreated).not.toHaveBeenCalled();
        });

        it('should commit node draft', async () => {
            const nodeRevisionDraftWithNewNodeInfo = {
                ...nodeRevisionDraft,
                newNodeInfo: {
                    parentUid: 'parentUid',
                    name: 'newNode:name',
                    encryptedName: 'newNode:encryptedName',
                    hash: 'newNode:hash',
                },
            };
            await manager.commitDraft(nodeRevisionDraftWithNewNodeInfo as any, manifest, extendedAttributes);

            expect(cryptoService.commitFile).toHaveBeenCalledWith(
                nodeRevisionDraft.nodeKeys,
                manifest,
                expect.anything(),
            );
            expect(apiService.commitDraftRevision).toHaveBeenCalledWith(
                nodeRevisionDraft.nodeRevisionUid,
                expect.anything(),
            );
            expect(nodesService.notifyChildCreated).toHaveBeenCalledWith('parentUid');
            expect(nodesService.notifyNodeChanged).not.toHaveBeenCalled();
        });

        it('should ignore error if revision was committed successfully', async () => {
            apiService.commitDraftRevision = jest
                .fn()
                .mockRejectedValue(new Error('Revision to commit must be a draft'));
            apiService.isRevisionUploaded = jest.fn().mockResolvedValue(true);

            await manager.commitDraft(nodeRevisionDraft as any, manifest, extendedAttributes);

            expect(apiService.commitDraftRevision).toHaveBeenCalledWith(
                nodeRevisionDraft.nodeRevisionUid,
                expect.anything(),
            );
            expect(nodesService.notifyNodeChanged).toHaveBeenCalled();
        });

        it('should throw error if revision was not committed successfully', async () => {
            apiService.commitDraftRevision = jest
                .fn()
                .mockRejectedValue(new Error('Revision to commit must be a draft'));
            apiService.isRevisionUploaded = jest.fn().mockResolvedValue(false);

            await expect(manager.commitDraft(nodeRevisionDraft as any, manifest, extendedAttributes)).rejects.toThrow(
                'Revision to commit must be a draft',
            );
            expect(nodesService.notifyNodeChanged).not.toHaveBeenCalled();
        });

        it('should throw original error if revision cannot be verified', async () => {
            apiService.commitDraftRevision = jest.fn().mockRejectedValue(new Error('Failed to commit revision'));
            apiService.isRevisionUploaded = jest.fn().mockRejectedValue(new Error('Failed to verify revision'));

            await expect(manager.commitDraft(nodeRevisionDraft as any, manifest, extendedAttributes)).rejects.toThrow(
                'Failed to commit revision',
            );
            expect(nodesService.notifyNodeChanged).not.toHaveBeenCalled();
        });
    });
});
