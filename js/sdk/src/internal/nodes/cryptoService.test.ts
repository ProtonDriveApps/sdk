import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from '../../crypto';
import { MemberRole, ProtonDriveAccount, ProtonDriveTelemetry, RevisionState } from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import {
    DecryptedNode,
    DecryptedNodeKeys,
    DecryptedUnparsedNode,
    EncryptedNode,
    NodeSigningKeys,
    SharesService,
} from './interface';
import { NodesCryptoService } from './cryptoService';
import { NodesCryptoReporter } from './cryptoReporter';

describe('nodesCryptoService', () => {
    let telemetry: ProtonDriveTelemetry;
    let driveCrypto: DriveCrypto;
    let account: ProtonDriveAccount;
    let sharesService: SharesService;

    let cryptoService: NodesCryptoService;

    const publicAddressKey = { _idx: 21312 };
    const ownPrivateAddressKey = { id: 'id', key: 'key' as unknown as PrivateKey };

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
            // @ts-expect-error Faking sessionKey as string.
            decryptAndVerifySessionKey: jest.fn(async () =>
                Promise.resolve({
                    sessionKey: 'contentKeyPacketSessionKey',
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
            verifyInvitation: jest.fn(async () =>
                Promise.resolve({
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
        };
        // @ts-expect-error No need to implement all methods for mocking
        account = {
            getPublicKeys: jest.fn(async () => [publicAddressKey]),
            getOwnAddresses: jest.fn(async () => [
                {
                    email: 'email',
                    addressId: 'addressId',
                    primaryKeyIndex: 0,
                    keys: [ownPrivateAddressKey],
                },
            ]),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            getMyFilesShareMemberEmailKey: jest.fn(async () => ({
                email: 'email',
                addressKey: 'key' as unknown as PrivateKey,
            })),
            getVolumeMetricContext: jest.fn().mockResolvedValue('own_volume'),
        };

        const nodesCryptoReporter = new NodesCryptoReporter(telemetry, sharesService);
        cryptoService = new NodesCryptoService(telemetry, driveCrypto, account, nodesCryptoReporter);
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
        let encryptedNode: EncryptedNode;

        beforeEach(() => {
            encryptedNode = {
                uid: 'volumeId~nodeId',
                parentUid: 'volumeId~parentId',
                membership: {
                    role: MemberRole.Admin,
                    inviteTime: new Date(1234567890000),
                },
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
                    membership: {
                        inviterEmail: 'inviterEmail',
                        base64MemberSharePassphraseKeyPacket: 'base64MemberSharePassphraseKeyPacket',
                        armoredInviterSharePassphraseKeyPacketSignature:
                            'armoredInviterSharePassphraseKeyPacketSignature',
                        armoredInviteeSharePassphraseSessionKeySignature:
                            'armoredInviteeSharePassphraseSessionKeySignature',
                    },
                },
            } as EncryptedNode;
        });

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
                    membership: {
                        role: MemberRole.Admin,
                        inviteTime: new Date(1234567890000),
                        sharedBy: { ok: true, value: 'inviterEmail' },
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
                encryptedNode.encryptedCrypto.nameSignatureEmail = 'signatureEmail';

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: true, value: 'signatureEmail' },
                    nameAuthor: { ok: true, value: 'signatureEmail' },
                });

                expect(account.getPublicKeys).toHaveBeenCalledTimes(2); // signatureEmail (for both key and name) and inviterEmail
                expect(account.getPublicKeys).toHaveBeenCalledWith('signatureEmail');
                expect(account.getPublicKeys).toHaveBeenCalledWith('inviterEmail');
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });

            it('different authors on key and name', async () => {
                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result);
                expect(account.getPublicKeys).toHaveBeenCalledTimes(3); // signatureEmail, nameSignatureEmail, inviterEmail
                expect(account.getPublicKeys).toHaveBeenCalledWith('signatureEmail');
                expect(account.getPublicKeys).toHaveBeenCalledWith('nameSignatureEmail');
                expect(account.getPublicKeys).toHaveBeenCalledWith('inviterEmail');
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
                        verificationErrors: [new Error('verification error')],
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
                    error: 'verification error',
                });
            });

            it('on node name', async () => {
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                        verificationErrors: [new Error('verification error')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'nameSignatureEmail',
                            error: 'Signature verification for name failed: verification error',
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeName',
                    error: 'verification error',
                });
            });

            it('on older node name ignores NOT_SIGNED', async () => {
                encryptedNode.creationTime = new Date('2020-12-31');
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                        verificationErrors: [new Error('missing signature')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: {
                        ok: true,
                        value: 'nameSignatureEmail',
                    },
                });
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });

            it('on newer node name does not ignore NOT_SIGNED', async () => {
                encryptedNode.creationTime = new Date('2021-01-01');
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                        verificationErrors: [new Error('missing signature')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'nameSignatureEmail',
                            error: 'Missing signature for name',
                        },
                    },
                });
            });

            it('on hash key', async () => {
                driveCrypto.decryptNodeHashKey = jest.fn(async () =>
                    Promise.resolve({
                        hashKey: new Uint8Array(),
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                        verificationErrors: [new Error('verification error')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'signatureEmail',
                            error: 'Signature verification for hash key failed: verification error',
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeHashKey',
                    error: 'verification error',
                });
            });

            it('on older node hash key ignores NOT_SIGNED', async () => {
                encryptedNode.creationTime = new Date('2021-07-31');
                driveCrypto.decryptNodeHashKey = jest.fn(async () =>
                    Promise.resolve({
                        hashKey: new Uint8Array(),
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                        verificationErrors: [new Error('missing signature')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: true,
                        value: 'signatureEmail',
                    },
                });
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });

            it('on newer node hash key does not ignore NOT_SIGNED', async () => {
                encryptedNode.creationTime = new Date('2021-08-01');
                driveCrypto.decryptNodeHashKey = jest.fn(async () =>
                    Promise.resolve({
                        hashKey: new Uint8Array(),
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                        verificationErrors: [new Error('missing signature')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'signatureEmail',
                            error: 'Missing signature for hash key',
                        },
                    },
                });
            });

            it('on node key and hash key reports error from node key', async () => {
                driveCrypto.decryptKey = jest.fn(async () =>
                    Promise.resolve({
                        passphrase: 'pass',
                        key: 'decryptedKey' as unknown as PrivateKey,
                        passphraseSessionKey: 'passphraseSessionKey' as unknown as SessionKey,
                        verified: VERIFICATION_STATUS.NOT_SIGNED,
                        verificationErrors: [new Error('verification error')],
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
                    error: 'verification error',
                });
            });

            it('on folder extended attributes', async () => {
                driveCrypto.decryptExtendedAttributes = jest.fn(async () =>
                    Promise.resolve({
                        extendedAttributes: '{}',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                        verificationErrors: [new Error('verification error')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'signatureEmail',
                            error: 'Signature verification for attributes failed: verification error',
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeExtendedAttributes',
                    error: 'verification error',
                });
            });

            it('on membership', async () => {
                driveCrypto.verifyInvitation = jest.fn().mockResolvedValue({
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                    verificationErrors: [new Error('verification error')],
                });

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    membership: {
                        role: MemberRole.Admin,
                        inviteTime: new Date(1234567890000),
                        sharedBy: {
                            ok: false,
                            error: {
                                claimedAuthor: 'inviterEmail',
                                error: 'Signature verification for membership failed: verification error',
                            },
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'membershipInviter',
                    error: 'verification error',
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

            it('on membership', async () => {
                const error = new Error('Decryption error');
                driveCrypto.verifyInvitation = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    membership: {
                        role: MemberRole.Admin,
                        inviteTime: new Date(1234567890000),
                        sharedBy: {
                            ok: false,
                            error: { claimedAuthor: 'inviterEmail', error: 'Failed to verify invitation' },
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'membershipInviter',
                    addressMatchingDefaultShare: undefined,
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
                    armoredContentKeyPacketSignature: 'armoredContentKeyPacketSignature',
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
                        verificationErrors: [new Error('verification error')],
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
                    error: 'verification error',
                });
            });

            it('on node name', async () => {
                driveCrypto.decryptNodeName = jest.fn(async () =>
                    Promise.resolve({
                        name: 'name',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                        verificationErrors: [new Error('verification error')],
                    }),
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'nameSignatureEmail',
                            error: 'Signature verification for name failed: verification error',
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeName',
                    error: 'verification error',
                });
            });

            it('on folder extended attributes', async () => {
                driveCrypto.decryptExtendedAttributes = jest.fn(async () =>
                    Promise.resolve({
                        extendedAttributes: '{}',
                        verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                        verificationErrors: [new Error('verification error')],
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
                                    error: 'Signature verification for attributes failed: verification error',
                                },
                            },
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeExtendedAttributes',
                    error: 'verification error',
                });
            });

            it('on content key packet without fallback verification', async () => {
                driveCrypto.decryptAndVerifySessionKey = jest.fn(
                    async () =>
                        Promise.resolve({
                            sessionKey: 'contentKeyPacketSessionKey',
                            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                            verificationErrors: [new Error('verification error')],
                        }) as any,
                );

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'signatureEmail',
                            error: 'Signature verification for content key failed: verification error',
                        },
                    },
                });
                verifyLogEventVerificationError({
                    field: 'nodeContentKey',
                    error: 'verification error',
                });
            });

            it('on content key packet with successful fallback verification', async () => {
                driveCrypto.decryptAndVerifySessionKey = jest
                    .fn()
                    .mockImplementationOnce(
                        async () =>
                            Promise.resolve({
                                sessionKey: 'contentKeyPacketSessionKey',
                                verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                                verificationErrors: [new Error('verification error')],
                            }) as any,
                    )
                    .mockImplementationOnce(
                        async () =>
                            Promise.resolve({
                                sessionKey: 'contentKeyPacketSessionKey',
                                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                            }) as any,
                    );

                const result = await cryptoService.decryptNode(
                    {
                        ...encryptedNode,
                        creationTime: new Date('2022-01-01'),
                    },
                    parentKey,
                );
                verifyResult(result);
                expect(driveCrypto.decryptAndVerifySessionKey).toHaveBeenCalledTimes(2);
                expect(driveCrypto.decryptAndVerifySessionKey).toHaveBeenCalledWith(
                    'base64ContentKeyPacket',
                    'armoredContentKeyPacketSignature',
                    'decryptedKey',
                    ['decryptedKey', publicAddressKey],
                );
                expect(driveCrypto.decryptAndVerifySessionKey).toHaveBeenCalledWith(
                    'base64ContentKeyPacket',
                    'armoredContentKeyPacketSignature',
                    'decryptedKey',
                    [ownPrivateAddressKey.key],
                );
                expect(telemetry.recordMetric).not.toHaveBeenCalled();
            });

            it('on content key packet with failed fallback verification', async () => {
                driveCrypto.decryptAndVerifySessionKey = jest
                    .fn()
                    .mockImplementationOnce(
                        async () =>
                            Promise.resolve({
                                sessionKey: 'contentKeyPacketSessionKey',
                                verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                                verificationErrors: [new Error('verification error')],
                            }) as any,
                    )
                    .mockImplementationOnce(
                        async () =>
                            Promise.resolve({
                                sessionKey: 'contentKeyPacketSessionKey',
                                verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                                verificationErrors: [new Error('fallback verification error')],
                            }) as any,
                    );

                const result = await cryptoService.decryptNode(
                    {
                        ...encryptedNode,
                        creationTime: new Date('2022-01-01'),
                    },
                    parentKey,
                );
                verifyResult(result, {
                    keyAuthor: {
                        ok: false,
                        error: {
                            claimedAuthor: 'signatureEmail',
                            error: 'Signature verification for content key failed: verification error',
                        },
                    },
                });
                expect(driveCrypto.decryptAndVerifySessionKey).toHaveBeenCalledTimes(2);
                expect(driveCrypto.decryptAndVerifySessionKey).toHaveBeenCalledWith(
                    'base64ContentKeyPacket',
                    'armoredContentKeyPacketSignature',
                    'decryptedKey',
                    ['decryptedKey', publicAddressKey],
                );
                expect(driveCrypto.decryptAndVerifySessionKey).toHaveBeenCalledWith(
                    'base64ContentKeyPacket',
                    'armoredContentKeyPacketSignature',
                    'decryptedKey',
                    [ownPrivateAddressKey.key],
                );
                verifyLogEventVerificationError({
                    field: 'nodeContentKey',
                    error: 'verification error',
                    fromBefore2024: true,
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

    describe('createFolder', () => {
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
            driveCrypto.encryptExtendedAttributes = jest.fn().mockResolvedValue({
                armoredExtendedAttributes: 'encryptedAttributes',
            });
        });

        it('should encrypt new folder with account key', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            const result = await cryptoService.createFolder(
                parentKeys,
                signingKeys,
                'New Folder',
                '{"modificationTime": 1234567890}',
            );

            expect(result).toEqual({
                encryptedCrypto: {
                    encryptedName: 'encryptedNodeName',
                    hash: 'lookupHash',
                    armoredKey: 'encryptedNodeKey',
                    armoredNodePassphrase: 'encryptedPassphrase',
                    armoredNodePassphraseSignature: 'passphraseSignature',
                    folder: {
                        armoredExtendedAttributes: 'encryptedAttributes',
                        armoredHashKey: 'encryptedHashKey',
                    },
                    signatureEmail: 'test@example.com',
                    nameSignatureEmail: 'test@example.com',
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
                'New Folder',
                undefined,
                parentKeys.key,
                signingKeys.key,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('New Folder', parentKeys.hashKey);
            expect(driveCrypto.generateHashKey).toHaveBeenCalledWith('nodeKey');
            expect(driveCrypto.encryptExtendedAttributes).toHaveBeenCalledWith(
                '{"modificationTime": 1234567890}',
                'nodeKey',
                signingKeys.key,
            );
        });

        it('should encrypt new folder with node key', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'nodeKey',
                nodeKey: 'nodeSigningKey' as any,
                parentNodeKey: 'parentNodeKey' as any,
            };

            const result = await cryptoService.createFolder(
                parentKeys,
                signingKeys,
                'New Folder',
                '{"modificationTime": 1234567890}',
            );

            expect(result).toEqual({
                encryptedCrypto: {
                    encryptedName: 'encryptedNodeName',
                    hash: 'lookupHash',
                    armoredKey: 'encryptedNodeKey',
                    armoredNodePassphrase: 'encryptedPassphrase',
                    armoredNodePassphraseSignature: 'passphraseSignature',
                    folder: {
                        armoredExtendedAttributes: 'encryptedAttributes',
                        armoredHashKey: 'encryptedHashKey',
                    },
                    signatureEmail: null,
                    nameSignatureEmail: null,
                },
                keys: {
                    passphrase: 'nodePassphrase',
                    key: 'nodeKey',
                    passphraseSessionKey: 'passphraseSessionKey',
                    hashKey: new Uint8Array([4, 5, 6]),
                },
            });

            expect(driveCrypto.generateKey).toHaveBeenCalledWith([parentKeys.key], signingKeys.parentNodeKey);
            expect(driveCrypto.encryptNodeName).toHaveBeenCalledWith(
                'New Folder',
                undefined,
                parentKeys.key,
                signingKeys.parentNodeKey,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('New Folder', parentKeys.hashKey);
            expect(driveCrypto.generateHashKey).toHaveBeenCalledWith('nodeKey');
            expect(driveCrypto.encryptExtendedAttributes).toHaveBeenCalledWith(
                '{"modificationTime": 1234567890}',
                'nodeKey',
                signingKeys.nodeKey,
            );
        });
    });

    describe('encryptNewName', () => {
        let parentKeys: any;
        let nodeNameSessionKey: SessionKey;

        beforeEach(() => {
            parentKeys = {
                key: 'parentKey' as any,
                hashKey: new Uint8Array([1, 2, 3]),
            };
            nodeNameSessionKey = 'nameSessionKey' as any;
            driveCrypto.encryptNodeName = jest.fn().mockResolvedValue({
                armoredNodeName: 'encryptedNewNodeName',
            });
            driveCrypto.generateLookupHash = jest.fn().mockResolvedValue('newHash');
        });

        it('should encrypt new name with account key', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            const result = await cryptoService.encryptNewName(
                parentKeys,
                nodeNameSessionKey,
                signingKeys,
                'Renamed File.txt',
            );

            expect(result).toEqual({
                signatureEmail: 'test@example.com',
                armoredNodeName: 'encryptedNewNodeName',
                hash: 'newHash',
            });

            expect(driveCrypto.encryptNodeName).toHaveBeenCalledWith(
                'Renamed File.txt',
                nodeNameSessionKey,
                parentKeys.key,
                signingKeys.key,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('Renamed File.txt', parentKeys.hashKey);
        });

        it('should encrypt new name with node key', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'nodeKey',
                nodeKey: 'nodeSigningKey' as any,
                parentNodeKey: 'parentNodeKey' as any,
            };

            const result = await cryptoService.encryptNewName(
                parentKeys,
                nodeNameSessionKey,
                signingKeys,
                'Renamed File.txt',
            );

            expect(result).toEqual({
                signatureEmail: null,
                armoredNodeName: 'encryptedNewNodeName',
                hash: 'newHash',
            });

            expect(driveCrypto.encryptNodeName).toHaveBeenCalledWith(
                'Renamed File.txt',
                nodeNameSessionKey,
                parentKeys.key,
                signingKeys.parentNodeKey,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('Renamed File.txt', parentKeys.hashKey);
        });
    });

    describe('encryptNodeWithNewParent', () => {
        let node: DecryptedNode;
        let keys: any;
        let parentKeys: any;

        beforeEach(() => {
            node = {
                name: { ok: true, value: 'testFile.txt' },
            } as DecryptedNode;
            keys = {
                passphrase: 'nodePassphrase',
                passphraseSessionKey: 'nodePassphraseSessionKey',
                nameSessionKey: 'nameSessionKey' as any,
            };
            parentKeys = {
                key: 'newParentKey' as any,
                hashKey: new Uint8Array([1, 2, 3]),
            };
            driveCrypto.encryptNodeName = jest.fn().mockResolvedValue({
                armoredNodeName: 'encryptedNodeName',
            });
            driveCrypto.generateLookupHash = jest.fn().mockResolvedValue('newHash');
            driveCrypto.encryptPassphrase = jest.fn().mockResolvedValue({
                armoredPassphrase: 'encryptedPassphrase',
                armoredPassphraseSignature: 'passphraseSignature',
            });
        });

        it('should encrypt node data for move operation with account key (logged in context)', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            const result = await cryptoService.encryptNodeWithNewParent(
                node.name,
                keys as any,
                parentKeys,
                signingKeys,
            );

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
                signingKeys.key,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('testFile.txt', parentKeys.hashKey);
            expect(driveCrypto.encryptPassphrase).toHaveBeenCalledWith(
                keys.passphrase,
                keys.passphraseSessionKey,
                [parentKeys.key],
                signingKeys.key,
            );
        });

        it('should encrypt node data for move operation with node key (anonymous context)', async () => {
            const signingKeys: NodeSigningKeys = {
                type: 'nodeKey',
                nodeKey: 'addressKey' as any,
                parentNodeKey: 'parentNodeKey' as any,
            };

            const result = await cryptoService.encryptNodeWithNewParent(
                node.name,
                keys as any,
                parentKeys,
                signingKeys,
            );

            expect(result).toEqual({
                encryptedName: 'encryptedNodeName',
                hash: 'newHash',
                armoredNodePassphrase: 'encryptedPassphrase',
                armoredNodePassphraseSignature: 'passphraseSignature',
                signatureEmail: null,
                nameSignatureEmail: null,
            });

            expect(driveCrypto.encryptNodeName).toHaveBeenCalledWith(
                'testFile.txt',
                keys.nameSessionKey,
                parentKeys.key,
                signingKeys.nodeKey,
            );
            expect(driveCrypto.generateLookupHash).toHaveBeenCalledWith('testFile.txt', parentKeys.hashKey);
            expect(driveCrypto.encryptPassphrase).toHaveBeenCalledWith(
                keys.passphrase,
                keys.passphraseSessionKey,
                [parentKeys.key],
                signingKeys.nodeKey,
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
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            await expect(
                cryptoService.encryptNodeWithNewParent(node.name, keys as any, parentKeys, signingKeys),
            ).rejects.toThrow('Moving item to a non-folder is not allowed');
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
            const signingKeys: NodeSigningKeys = {
                type: 'userAddress',
                email: 'test@example.com',
                addressId: 'addressId',
                key: 'addressKey' as any,
            };

            await expect(
                cryptoService.encryptNodeWithNewParent(node, keys as any, parentKeys, signingKeys),
            ).rejects.toThrow('Cannot move item without a valid name, please rename the item first');
        });
    });
});
