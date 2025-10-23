import { ValidationError } from '../../errors';
import { ProtonDriveTelemetry, UploadMetadata } from '../../interface';
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
                signatureAddress: {
                    email: 'signatureEmail',
                },
            }),
            commitFile: jest.fn().mockResolvedValue({
                armoredManifestSignature: 'newNode:armoredManifestSignature',
                signatureEmail: 'signatureEmail',
                armoredExtendedAttributes: 'newNode:armoredExtendedAttributes',
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
            getRootNodeEmailKey: jest.fn().mockResolvedValue({
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
                    signatureAddress: {
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
                    signatureAddress: {
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
    });
});
