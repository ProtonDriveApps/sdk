import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from '../../crypto';
import { ProtonDriveAccount, ProtonDriveTelemetry, RevisionState } from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import { DecryptedNode, DecryptedNodeKeys, DecryptedUnparsedNode, EncryptedNode, SharesService } from './interface';
import { NodesCryptoService } from './cryptoService';

describe('nodesCryptoService', () => {
    let telemetry: ProtonDriveTelemetry;
    let driveCrypto: DriveCrypto;
    let account: ProtonDriveAccount;
    let sharesService: SharesService;

    let cryptoService: NodesCryptoService;

    beforeEach(() => {
        jest.clearAllMocks();

        telemetry = getMockTelemetry();
        driveCrypto = {
            decryptKey: jest.fn(async () =>
                Promise.resolve({
                    passphrase: 'pass',
                    key: 'decryptedKey' as unknown as PrivateKey,
                    passphraseSessionKey: 'passphraseSessionKey' as unknown as SessionKey,
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
            decryptNodeName: jest.fn(async () =>
                Promise.resolve({
                    name: 'name',
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
            decryptNodeHashKey: jest.fn(async () =>
                Promise.resolve({
                    hashKey: new Uint8Array(),
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
            decryptExtendedAttributes: jest.fn(async () =>
                Promise.resolve({
                    extendedAttributes: '{}',
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
            encryptNodeName: jest.fn(async () =>
                Promise.resolve({
                    armoredNodeName: 'armoredName',
                }),
            ),
            // @ts-expect-error No need to implement all methods for mocking
            decryptAndVerifySessionKey: jest.fn(async () =>
                Promise.resolve({
                    sessionKey: 'contentKeyPacketSessionKey',
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
        };
        account = {
            // @ts-expect-error No need to implement all methods for mocking
            getPublicKeys: jest.fn(async () => [{ _idx: 21312 }]),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            getMyFilesShareMemberEmailKey: jest.fn(async () => ({
                email: 'email',
                addressKey: 'key' as unknown as PrivateKey,
            })),
            getVolumeMetricContext: jest.fn().mockResolvedValue('own_volume'),
        };

        cryptoService = new NodesCryptoService(telemetry, driveCrypto, account, sharesService);
    });

    const parentKey = 'parentKey' as unknown as PrivateKey;

    function verifyLogEventVerificationError(options = {}) {
        expect(telemetry.recordMetric).toHaveBeenCalledTimes(1);
        expect(telemetry.recordMetric).toHaveBeenCalledWith({
            eventName: 'verificationError',
            volumeType: 'own_volume',
            fromBefore2024: false,
            addressMatchingDefaultShare: false,
            uid: 'volumeId~nodeId',
            ...options,
        });
    }

    function verifyLogEventDecryptionError(options = {}) {
        expect(telemetry.recordMetric).toHaveBeenCalledTimes(1);
        expect(telemetry.recordMetric).toHaveBeenCalledWith({
            eventName: 'decryptionError',
            volumeType: 'own_volume',
            fromBefore2024: false,
            uid: 'volumeId~nodeId',
            ...options,
        });
    }

    describe('folder node', () => {
        const encryptedNode = {
            uid: 'volumeId~nodeId',
            parentUid: 'volumeId~parentId',
            encryptedCrypto: {
                signatureEmail: 'signatureEmail',
                nameSignatureEmail: 'nameSignatureEmail',
                armoredKey: 'armoredKey',
                armoredNodePassphrase: 'armoredNodePassphrase',
                armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
                folder: {
                    armoredHashKey: 'armoredHashKey',
                    armoredExtendedAttributes: 'folderArmoredExtendedAttributes',
                },
            },
        } as EncryptedNode;

        function verifyResult(
            result: { node: DecryptedUnparsedNode; keys?: DecryptedNodeKeys },
            expectedNode: Partial<DecryptedUnparsedNode> = {},
            expectedKeys: Partial<DecryptedNodeKeys> | 'noKeys' = {},
        ) {
            expect(result).toMatchObject({
                node: {
                    name: { ok: true, value: 'name' },
                    keyAuthor: { ok: true, value: 'signatureEmail' },
                    nameAuthor: { ok: true, value: 'nameSignatureEmail' },
                    folder: {
                        extendedAttributes: '{}',
                    },
                    activeRevision: undefined,
                    errors: undefined,
                    ...expectedNode,
                },
                ...(expectedKeys === 'noKeys'
                    ? {}
                    : {
                          keys: {
                              passphrase: 'pass',
                              key: 'decryptedKey',
                              passphraseSessionKey: 'passphraseSessionKey',
                              hashKey: new Uint8Array(),
                              ...expectedKeys,
                          },
                      }),
            });
        }

        describe('should decrypt successfuly', () => {
            it('same author everywhere', async () => {
                const encryptedNode = {
                    encryptedCrypto: {
                        signatureEmail: 'signatureEmail',
                        nameSignatureEmail: 'signatureEmail',
                        armoredKey: 'armoredKey',
                        armoredNodePassphrase: 'armoredNodePassphrase',
                        armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
                        folder: {
                            armoredHashKey: 'armoredHashKey',
                            armoredExtendedAttributes: 'folderArmoredExtendedAttributes',
                        },
                    },
                } as EncryptedNode;

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: true, value: 'signatureEmail' },
                    nameAuthor: { ok: true, value: 'signatureEmail' },
                });

                expect(account.getPublicKeys).toHaveBeenCalledTimes(1);
                expect(account.getPublicKeys).toHaveBeenCalledWith('signatureEmail');
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });

            it('different authors on key and name', async () => {
                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result);
                expect(account.getPublicKeys).toHaveBeenCalledTimes(2);
                expect(account.getPublicKeys).toHaveBeenCalledWith('signatureEmail');
                expect(account.getPublicKeys).toHaveBeenCalledWith('nameSignatureEmail');
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });
        });

        describe('should decrypt with verification issues', () => {
            it('on node key', async () => {
                driveCrypto.decryptKey = jest.fn(async () =>
                    Promise.resolve({
                        passphrase: 'pass',
                        key: 'decryptedKey' as unknown as PrivateKey,
                        passphraseSessionKey: 'passphraseSessionKey' as unknown as SessionKey,
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: { claimedAuthor: 'signatureEmail', error: 'Missing signature for key' },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeKey',
                });
            });

            it('on node name', async () => {
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: {
                        ok: false,
                        error: { claimedAuthor: 'nameSignatureEmail', error: 'Signature verification for name failed' },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeName',
                });
            });

            it('on hash key', async () => {
                driveCrypto.decryptNodeHashKey = jest.fn(async () =>
                    Promise.resolve({
                        hashKey: new Uint8Array(),
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: { claimedAuthor: 'signatureEmail', error: 'Signature verification for hash key failed' },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeHashKey',
                });
            });

            it('on node key and hash key reports error from node key', async () => {
                driveCrypto.decryptKey = jest.fn(async () =>
                    Promise.resolve({
                        passphrase: 'pass',
                        key: 'decryptedKey' as unknown as PrivateKey,
                        passphraseSessionKey: 'passphraseSessionKey' as unknown as SessionKey,
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                    }),
                );
                driveCrypto.decryptNodeHashKey = jest.fn(async () =>
                    Promise.resolve({
                        hashKey: new Uint8Array(),
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: { claimedAuthor: 'signatureEmail', error: 'Missing signature for key' },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeKey',
                });
            });

            it('on folder extended attributes', async () => {
                driveCrypto.decryptExtendedAttributes = jest.fn(async () =>
                    Promise.resolve({
                        extendedAttributes: '{}',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'signatureEmail',
                            error: 'Signature verification for attributes failed',
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeExtendedAttributes',
                });
            });
        });

        describe('should decrypt with decryption issues', () => {
            it('on node key', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(
                    result,
                    {
                        keyAuthor: {
                            ok: false,
                            error: {
                                claimedAuthor: 'signatureEmail',
                                error: 'Failed to decrypt node key: Decryption error',
                            },
                        },
                        errors: [new Error('Decryption error')],
                        folder: undefined,
                    },
                    'noKeys',
                );
                verifyLogEventDecryptionError({
                    field: 'nodeKey',
                    error,
                });
            });

            it('on node name', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptNodeName = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(
                    result,
                    {
                        name: { ok: false, error },
                        nameAuthor: {
                            ok: false,
                            error: { claimedAuthor: 'nameSignatureEmail', error: 'Decryption error' },
                        },
                    },
                    'noKeys',
                );
                verifyLogEventDecryptionError({
                    field: 'nodeName',
                    error,
                });
            });

            it('on hash key', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptNodeHashKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(
                    result,
                    {
                        errors: [error],
                    },
                    'noKeys',
                );
                verifyLogEventDecryptionError({
                    field: 'nodeHashKey',
                    error,
                });
            });

            it('on folder extended attributes', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(
                    result,
                    {
                        folder: undefined,
                        errors: [error],
                    },
                    'noKeys',
                );
                verifyLogEventDecryptionError({
                    field: 'nodeExtendedAttributes',
                    error,
                });
            });
        });

        it('should fail when keys cannot be loaded', async () => {
            account.getPublicKeys = jest.fn().mockRejectedValue(new Error('Failed to load keys'));

            const result = cryptoService.decryptNode(encryptedNode, parentKey);
            await expect(result).rejects.toThrow('Failed to load keys');
        });
    });

    describe('file node', () => {
        const encryptedNode = {
            uid: 'volumeId~nodeId',
            parentUid: 'volumeId~parentId',
            encryptedCrypto: {
                signatureEmail: 'signatureEmail',
                nameSignatureEmail: 'nameSignatureEmail',
                armoredKey: 'armoredKey',
                armoredNodePassphrase: 'armoredNodePassphrase',
                armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
                file: {
                    base64ContentKeyPacket: 'base64ContentKeyPacket',
                },
                activeRevision: {
                    uid: 'revisionUid',
                    state: 'active',
                    signatureEmail: 'revisionSignatureEmail',
                    armoredExtendedAttributes: 'encryptedExtendedAttributes',
                },
            },
        } as EncryptedNode;

        function verifyResult(
            result: { node: DecryptedUnparsedNode; keys?: DecryptedNodeKeys },
            expectedNode: Partial<DecryptedUnparsedNode> = {},
            expectedKeys: Partial<DecryptedNodeKeys> | 'noKeys' = {},
        ) {
            expect(result).toMatchObject({
                node: {
                    name: { ok: true, value: 'name' },
                    keyAuthor: { ok: true, value: 'signatureEmail' },
                    nameAuthor: { ok: true, value: 'nameSignatureEmail' },
                    folder: undefined,
                    activeRevision: {
                        ok: true,
                        value: {
                            uid: 'revisionUid',
                            state: RevisionState.Active,
                            creationTime: undefined,
                            extendedAttributes: '{}',
                            contentAuthor: { ok: true, value: 'revisionSignatureEmail' },
                        },
                    },
                    errors: undefined,
                    ...expectedNode,
                },
                ...(expectedKeys === 'noKeys'
                    ? {}
                    : {
                          keys: {
                              passphrase: 'pass',
                              key: 'decryptedKey',
                              passphraseSessionKey: 'passphraseSessionKey',
                              hashKey: undefined,
                              contentKeyPacketSessionKey: 'contentKeyPacketSessionKey',
                              ...expectedKeys,
                          },
                      }),
            });
        }

        describe('should decrypt successfuly', () => {
            it('same author everywhere', async () => {
                const encryptedNode = {
                    encryptedCrypto: {
                        signatureEmail: 'signatureEmail',
                        nameSignatureEmail: 'signatureEmail',
                        armoredKey: 'armoredKey',
                        armoredNodePassphrase: 'armoredNodePassphrase',
                        armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
                        file: {
                            base64ContentKeyPacket: 'base64ContentKeyPacket',
                        },
                        activeRevision: {
                            uid: 'revisionUid',
                            state: 'active',
                            signatureEmail: 'signatureEmail',
                            armoredExtendedAttributes: 'encryptedExtendedAttributes',
                        },
                    },
                } as EncryptedNode;

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: true, value: 'signatureEmail' },
                    nameAuthor: { ok: true, value: 'signatureEmail' },
                    activeRevision: {
                        ok: true,
                        value: {
                            uid: 'revisionUid',
                            state: RevisionState.Active,
                            // @ts-expect-error Ignore mocked data.
                            creationTime: undefined,
                            extendedAttributes: '{}',
                            contentAuthor: { ok: true, value: 'signatureEmail' },
                        },
                    },
                });

                expect(account.getPublicKeys).toHaveBeenCalledTimes(2); // node + revision
                expect(account.getPublicKeys).toHaveBeenCalledWith('signatureEmail');
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });

            it('different authors on key and name', async () => {
                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result);
                expect(account.getPublicKeys).toHaveBeenCalledTimes(3);
                expect(account.getPublicKeys).toHaveBeenCalledWith('signatureEmail');
                expect(account.getPublicKeys).toHaveBeenCalledWith('nameSignatureEmail');
                expect(account.getPublicKeys).toHaveBeenCalledWith('revisionSignatureEmail');
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });
        });

        describe('should decrypt with verification issues', () => {
            it('on node key', async () => {
                driveCrypto.decryptKey = jest.fn(async () =>
                    Promise.resolve({
                        passphrase: 'pass',
                        key: 'decryptedKey' as unknown as PrivateKey,
                        passphraseSessionKey: 'passphraseSessionKey' as unknown as SessionKey,
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: { claimedAuthor: 'signatureEmail', error: 'Missing signature for key' },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeKey',
                });
            });

            it('on node name', async () => {
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: {
                        ok: false,
                        error: { claimedAuthor: 'nameSignatureEmail', error: 'Signature verification for name failed' },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeName',
                });
            });

            it('on folder extended attributes', async () => {
                driveCrypto.decryptExtendedAttributes = jest.fn(async () =>
                    Promise.resolve({
                        extendedAttributes: '{}',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    activeRevision: {
                        ok: true,
                        value: {
                            uid: 'revisionUid',
                            extendedAttributes: '{}',
                            state: RevisionState.Active,
                            // @ts-expect-error Ignore mocked data.
                            creationTime: undefined,
                            contentAuthor: {
                                ok: false,
                                error: {
                                    claimedAuthor: 'revisionSignatureEmail',
                                    error: 'Signature verification for attributes failed',
                                },
                            },
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeExtendedAttributes',
                });
            });

            it('on content key packet', async () => {
                driveCrypto.decryptAndVerifySessionKey = jest.fn(
                    async () =>
                        Promise.resolve({
                            sessionKey: 'contentKeyPacketSessionKey',
                            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                        }) as any,
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'signatureEmail',
                            error: 'Signature verification for content key failed',
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeContentKey',
                });
            });
        });

        describe('should decrypt with decryption issues', () => {
            it('on node key', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(
                    result,
                    {
                        keyAuthor: {
                            ok: false,
                            error: {
                                claimedAuthor: 'signatureEmail',
                                error: 'Failed to decrypt node key: Decryption error',
                            },
                        },
                        activeRevision: { ok: false, error: new Error('Failed to decrypt node key: Decryption error') },
                        errors: [new Error('Decryption error')],
                        folder: undefined,
                    },
                    'noKeys',
                );
                verifyLogEventDecryptionError({
                    field: 'nodeKey',
                    error,
                });
            });

            it('on node name', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptNodeName = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(
                    result,
                    {
                        name: { ok: false, error },
                        nameAuthor: {
                            ok: false,
                            error: { claimedAuthor: 'nameSignatureEmail', error: 'Decryption error' },
                        },
                    },
                    'noKeys',
                );
                verifyLogEventDecryptionError({
                    field: 'nodeName',
                    error,
                });
            });

            it('on file extended attributes', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    activeRevision: {
                        ok: false,
                        error: new Error('Failed to decrypt active revision: Decryption error'),
                    },
                });
                verifyLogEventDecryptionError({
                    field: 'nodeExtendedAttributes',
                    error,
                });
            });

            it('on content key packet', async () => {
                const error = new Error('Decryption error');
                driveCrypto.decryptAndVerifySessionKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(
                    result,
                    {
                        keyAuthor: {
                            ok: false,
                            error: {
                                claimedAuthor: 'signatureEmail',
                                error: 'Failed to decrypt content key: Decryption error',
                            },
                        },
                        errors: [error],
                    },
                    {
                        contentKeyPacketSessionKey: undefined,
                    },
                );
                verifyLogEventDecryptionError({
                    field: 'nodeContentKey',
                    error,
                });
            });
        });

        it('should fail when keys cannot be loaded', async () => {
            account.getPublicKeys = jest.fn().mockRejectedValue(new Error('Failed to load keys'));

            const result = cryptoService.decryptNode(encryptedNode, parentKey);
            await expect(result).rejects.toThrow('Failed to load keys');
        });
    });

    describe('album node', () => {
        const encryptedNode = {
            uid: 'volumeId~nodeId',
            parentUid: 'volumeId~parentId',
            encryptedCrypto: {
                signatureEmail: 'signatureEmail',
                nameSignatureEmail: 'nameSignatureEmail',
                armoredKey: 'armoredKey',
                armoredNodePassphrase: 'armoredNodePassphrase',
                armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
            },
        } as EncryptedNode;

        it('should decrypt successfuly', async () => {
            const result = await cryptoService.decryptNode(encryptedNode, parentKey);

            expect(result).toMatchObject({
                node: {
                    name: { ok: true, value: 'name' },
                    keyAuthor: { ok: true, value: 'signatureEmail' },
                    nameAuthor: { ok: true, value: 'nameSignatureEmail' },
                    folder: undefined,
                    activeRevision: undefined,
                    errors: undefined,
                },
                keys: {
                    passphrase: 'pass',
                    key: 'decryptedKey',
                    passphraseSessionKey: 'passphraseSessionKey',
                    hashKey: new Uint8Array(),
                },
            });

            expect(account.getPublicKeys).toHaveBeenCalledTimes(2);
            expect(telemetry.recordMetric).not.toHaveBeenCalled();
        });
    });

    describe('anonymous node', () => {
        const encryptedNode = {
            uid: 'volumeId~nodeId',
            parentUid: 'volumeId~parentId',
            encryptedCrypto: {
                signatureEmail: undefined,
                nameSignatureEmail: undefined,
                armoredKey: 'armoredKey',
                armoredNodePassphrase: 'armoredNodePassphrase',
                armoredNodePassphraseSignature: 'armoredNodePassphraseSignature',
                file: {
                    base64ContentKeyPacket: 'base64ContentKeyPacket',
                },
                activeRevision: {
                    uid: 'revisionUid',
                    state: 'active',
                    signatureEmail: 'revisionSignatureEmail',
                    armoredExtendedAttributes: 'encryptedExtendedAttributes',
                },
            },
        } as EncryptedNode;

        const encryptedNodeWithoutParent = {
            ...encryptedNode,
            parentUid: undefined,
        };

        function verifyResult(
            result: { node: DecryptedUnparsedNode; keys?: DecryptedNodeKeys },
            expectedNode: Partial<DecryptedUnparsedNode> = {},
            expectedKeys: Partial<DecryptedNodeKeys> | 'noKeys' = {},
        ) {
            expect(result).toMatchObject({
                node: {
                    name: { ok: true, value: 'name' },
                    keyAuthor: { ok: true, value: 'signatureEmail' },
                    nameAuthor: { ok: true, value: 'nameSignatureEmail' },
                    folder: undefined,
                    activeRevision: {
                        ok: true,
                        value: {
                            uid: 'revisionUid',
                            state: RevisionState.Active,
                            creationTime: undefined,
                            extendedAttributes: '{}',
                            contentAuthor: { ok: true, value: 'revisionSignatureEmail' },
                        },
                    },
                    errors: undefined,
                    ...expectedNode,
                },
                ...(expectedKeys === 'noKeys'
                    ? {}
                    : {
                          keys: {
                              passphrase: 'pass',
                              key: 'decryptedKey',
                              passphraseSessionKey: 'passphraseSessionKey',
                              hashKey: undefined,
                              contentKeyPacketSessionKey: 'contentKeyPacketSessionKey',
                              ...expectedKeys,
                          },
                      }),
            });
        }

        describe('should decrypt with verification issues', () => {
            it('on node key and name with access to parent node', async () => {
                driveCrypto.decryptKey = jest.fn(async () =>
                    Promise.resolve({
                        passphrase: 'pass',
                        key: 'decryptedKey' as unknown as PrivateKey,
                        passphraseSessionKey: 'passphraseSessionKey' as unknown as SessionKey,
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: { claimedAuthor: undefined, error: 'Signature verification for key failed' },
                    },
                    nameAuthor: {
                        ok: false,
                        error: { claimedAuthor: undefined, error: 'Signature verification for name failed' },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeName',
                    addressMatchingDefaultShare: undefined,
                });
                expect(driveCrypto.decryptKey).toHaveBeenCalledWith(
                    encryptedNode.encryptedCrypto.armoredKey,
                    encryptedNode.encryptedCrypto.armoredNodePassphrase,
                    encryptedNode.encryptedCrypto.armoredNodePassphraseSignature,
                    [parentKey],
                    [parentKey],
                );
                expect(driveCrypto.decryptNodeName).toHaveBeenCalledWith(encryptedNode.encryptedName, parentKey, [
                    parentKey,
                ]);
            });

            it('on anonymous node key and name without access to parent node', async () => {
                driveCrypto.decryptKey = jest.fn(async () =>
                    Promise.resolve({
                        passphrase: 'pass',
                        key: 'decryptedKey' as unknown as PrivateKey,
                        passphraseSessionKey: 'passphraseSessionKey' as unknown as SessionKey,
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNodeWithoutParent, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: true, value: null },
                    nameAuthor: { ok: true, value: null },
                });
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
                expect(driveCrypto.decryptKey).toHaveBeenCalledWith(
                    encryptedNode.encryptedCrypto.armoredKey,
                    encryptedNode.encryptedCrypto.armoredNodePassphrase,
                    encryptedNode.encryptedCrypto.armoredNodePassphraseSignature,
                    [parentKey],
                    [],
                );
                expect(driveCrypto.decryptNodeName).toHaveBeenCalledWith(encryptedNode.encryptedName, parentKey, []);
            });
        });
    });

    describe('moveNode', () => {
        it('should encrypt node data for move operation', async () => {
            const node = {
                name: { ok: true, value: 'testFile.txt' },
            } as DecryptedNode;
            const keys = {
                passphrase: 'nodePassphrase',
                passphraseSessionKey: 'nodePassphraseSessionKey',
                nameSessionKey: 'nameSessionKey' as any,
            };
            const parentKeys = {
                key: 'newParentKey' as any,
                hashKey: new Uint8Array([1, 2, 3]),
            };
            const address = {
                email: 'test@example.com',
                addressKey: 'addressKey' as any,
            };
            driveCrypto.encryptNodeName = jest.fn().mockResolvedValue({
                armoredNodeName: 'encryptedNodeName',
            });
            driveCrypto.generateLookupHash = jest.fn().mockResolvedValue('newHash');
            driveCrypto.encryptPassphrase = jest.fn().mockResolvedValue({
                armoredPassphrase: 'encryptedPassphrase',
                armoredPassphraseSignature: 'passphraseSignature',
            });

            const result = await cryptoService.moveNode(node, keys as any, parentKeys, address);

            expect(result).toEqual({
                encryptedName: 'encryptedNodeName',
                hash: 'newHash',
                armoredNodePassphrase: 'encryptedPassphrase',
                armoredNodePassphraseSignature: 'passphraseSignature',
                signatureEmail: 'test@example.com',
                nameSignatureEmail: 'test@example.com',
            });

            expect(driveCrypto.encryptNodeName).toHaveBeenCalledWith(
                'testFile.txt',
                keys.nameSessionKey,
                parentKeys.key,
                address.addressKey,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('testFile.txt', parentKeys.hashKey);
            expect(driveCrypto.encryptPassphrase).toHaveBeenCalledWith(
                keys.passphrase,
                keys.passphraseSessionKey,
                [parentKeys.key],
                address.addressKey,
            );
        });

        it('should throw error when moving to non-folder', async () => {
            const node = {
                name: { ok: true, value: 'testFile.txt' },
            } as DecryptedNode;
            const keys = {
                passphrase: 'nodePassphrase',
                passphraseSessionKey: 'nodePassphraseSessionKey',
                nameSessionKey: 'nameSessionKey' as any,
            };
            const parentKeys = {
                key: 'newParentKey' as any,
                hashKey: undefined,
            } as any;
            const address = {
                email: 'test@example.com',
                addressKey: 'addressKey' as any,
            };

            await expect(cryptoService.moveNode(node, keys as any, parentKeys, address)).rejects.toThrow(
                'Moving item to a non-folder is not allowed',
            );
        });

        it('should throw error when node has invalid name', async () => {
            const node = {
                name: { ok: false, error: 'Invalid name' },
            } as any;
            const keys = {
                passphrase: 'nodePassphrase',
                passphraseSessionKey: 'nodePassphraseSessionKey',
                nameSessionKey: 'nameSessionKey' as any,
            };
            const parentKeys = {
                key: 'newParentKey' as any,
                hashKey: new Uint8Array([1, 2, 3]),
            };
            const address = {
                email: 'test@example.com',
                addressKey: 'addressKey' as any,
            };

            await expect(cryptoService.moveNode(node, keys as any, parentKeys, address)).rejects.toThrow(
                'Cannot move item without a valid name, please rename the item first',
            );
        });
    });
});
