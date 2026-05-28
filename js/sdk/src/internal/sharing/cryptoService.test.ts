import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from '../../crypto';
import {
    MemberRole,
    MetricVolumeType,
    NodeType,
    NonProtonInvitationState,
    ProtonDriveAccount,
    ProtonDriveTelemetry,
    resultError,
    resultOk,
} from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import { SharingCryptoService } from './cryptoService';
import { SharesService } from './interface';

describe('SharingCryptoService', () => {
    let telemetry: ProtonDriveTelemetry;
    let driveCrypto: DriveCrypto;
    let account: ProtonDriveAccount;
    let sharesService: SharesService;
    let cryptoService: SharingCryptoService;

    beforeEach(() => {
        telemetry = getMockTelemetry();
        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {
            decryptShareUrlPassword: jest.fn().mockResolvedValue('urlPassword'),
            decryptKeyWithSrpPassword: jest.fn().mockResolvedValue({
                key: 'decryptedKey' as unknown as PrivateKey,
            }),
            decryptNodeName: jest.fn().mockResolvedValue({
                name: 'nodeName',
            }),
        };
        account = {
            // @ts-expect-error No need to implement full response for mocking
            getOwnAddress: jest.fn(async () => ({
                keys: [{ key: 'addressKey' as unknown as PrivateKey }],
            })),
            getPublicKeys: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            getMyFilesShareMemberEmailKey: jest.fn().mockResolvedValue({
                addressId: 'addressId',
                addressKey: 'addressKey' as unknown as PrivateKey,
                addressKeyId: 'keyId',
            }),
        };
        cryptoService = new SharingCryptoService(telemetry, driveCrypto, account, sharesService);
    });

    describe('decryptBookmark', () => {
        const encryptedBookmark = {
            tokenId: 'tokenId',
            creationTime: new Date(),
            url: {
                encryptedUrlPassword: 'encryptedUrlPassword',
                base64SharePasswordSalt: 'base64SharePasswordSalt',
            },
            share: {
                armoredKey: 'armoredKey',
                armoredPassphrase: 'armoredPassphrase',
            },
            node: {
                type: NodeType.File,
                mediaType: 'mediaType',
                encryptedName: 'encryptedName',
                armoredKey: 'armoredKey',
                armoredNodePassphrase: 'armoredNodePassphrase',
                file: {
                    base64ContentKeyPacket: 'base64ContentKeyPacket',
                },
            },
        };

        it('should decrypt bookmark', async () => {
            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk('https://drive.proton.me/urls/tokenId#urlPassword'),
                nodeName: resultOk('nodeName'),
            });
            expect(driveCrypto.decryptShareUrlPassword).toHaveBeenCalledWith('encryptedUrlPassword', ['addressKey']);
            expect(driveCrypto.decryptKeyWithSrpPassword).toHaveBeenCalledWith(
                'urlPassword',
                'base64SharePasswordSalt',
                'armoredKey',
                'armoredPassphrase',
            );
            expect(driveCrypto.decryptNodeName).toHaveBeenCalledWith('encryptedName', 'decryptedKey', []);
            expect(telemetry.recordMetric).not.toHaveBeenCalled();
        });

        it('should decrypt bookmark with custom password', async () => {
            // First 12 characters are the generated password. Anything beyond is the custom password.
            driveCrypto.decryptShareUrlPassword = jest.fn().mockResolvedValue('urlPassword1WithCustomPassword');

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk('https://drive.proton.me/urls/tokenId#urlPassword1'),
                nodeName: resultOk('nodeName'),
            });
            expect(driveCrypto.decryptShareUrlPassword).toHaveBeenCalledWith('encryptedUrlPassword', ['addressKey']);
            expect(driveCrypto.decryptKeyWithSrpPassword).toHaveBeenCalledWith(
                'urlPassword1WithCustomPassword',
                'base64SharePasswordSalt',
                'armoredKey',
                'armoredPassphrase',
            );
            expect(driveCrypto.decryptNodeName).toHaveBeenCalledWith('encryptedName', 'decryptedKey', []);
            expect(telemetry.recordMetric).not.toHaveBeenCalled();
        });

        it('should handle undecryptable URL password', async () => {
            const error = new Error('Failed to decrypt URL password');
            driveCrypto.decryptShareUrlPassword = jest.fn().mockRejectedValue(error);

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultError(new Error('Failed to decrypt bookmark password: Failed to decrypt URL password')),
                nodeName: resultError(new Error('Failed to decrypt bookmark password: Failed to decrypt URL password')),
            });
            expect(telemetry.recordMetric).toHaveBeenCalledWith({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'shareUrlPassword',
                error,
                uid: 'tokenId',
            });
        });

        it('should handle undecryptable share key', async () => {
            const error = new Error('Failed to decrypt share key');
            driveCrypto.decryptKeyWithSrpPassword = jest.fn().mockRejectedValue(error);

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk('https://drive.proton.me/urls/tokenId#urlPassword'),
                nodeName: resultError(new Error('Failed to decrypt bookmark key: Failed to decrypt share key')),
            });
            expect(telemetry.recordMetric).toHaveBeenCalledWith({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'shareKey',
                error,
                uid: 'tokenId',
            });
        });

        it('should handle undecryptable node name', async () => {
            const error = new Error('Failed to decrypt node name');
            driveCrypto.decryptNodeName = jest.fn().mockRejectedValue(error);

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk('https://drive.proton.me/urls/tokenId#urlPassword'),
                nodeName: resultError(new Error('Failed to decrypt bookmark name: Failed to decrypt node name')),
            });
            expect(telemetry.recordMetric).toHaveBeenCalledWith({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'nodeName',
                error,
                uid: 'tokenId',
            });
        });

        it('should handle invalid node name', async () => {
            driveCrypto.decryptNodeName = jest.fn().mockResolvedValue({
                name: '',
            });

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk('https://drive.proton.me/urls/tokenId#urlPassword'),
                nodeName: resultError({
                    name: '',
                    error: 'Name must not be empty',
                }),
            });
        });
    });

    describe('decryptInvitation', () => {
        const encryptedInvitation = {
            uid: 'invitation-uid',
            invitationTime: new Date(),
            addedByEmail: 'inviter@example.com',
            inviteeEmail: 'invitee@example.com',
            role: MemberRole.Viewer,
            base64KeyPacket: 'keyPacket',
            base64KeyPacketSignature: 'keyPacketSignature',
        };

        beforeEach(() => {
            account.getPublicKeys = jest.fn().mockResolvedValue(['publicKey']);
            driveCrypto.verifyInvitation = jest.fn().mockResolvedValue({
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            });
        });

        it('should verify addedByEmail when signature is valid', async () => {
            const result = await cryptoService.decryptInvitation(encryptedInvitation);

            expect(result.addedByEmail).toEqual(resultOk('inviter@example.com'));
            expect(driveCrypto.verifyInvitation).toHaveBeenCalledWith('keyPacket', { base64: 'keyPacketSignature' }, [
                'publicKey',
            ]);
        });

        it('should return unverified addedByEmail when signature is invalid', async () => {
            driveCrypto.verifyInvitation = jest.fn().mockResolvedValue({
                verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                verificationErrors: [new Error('Invalid signature')],
            });

            const result = await cryptoService.decryptInvitation(encryptedInvitation);

            expect(result.addedByEmail).toEqual(
                resultError({
                    claimedAuthor: 'inviter@example.com',
                    error: 'Signature verification failed: Invalid signature',
                }),
            );
        });

        it('should return unverified addedByEmail when inviter keys cannot be loaded', async () => {
            account.getPublicKeys = jest.fn().mockRejectedValue(new Error('Keys not found'));
            driveCrypto.verifyInvitation = jest.fn().mockResolvedValue({
                verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                verificationErrors: [new Error('Invalid signature')],
            });

            const result = await cryptoService.decryptInvitation(encryptedInvitation);

            expect(result.addedByEmail).toEqual(
                resultError({
                    claimedAuthor: 'inviter@example.com',
                    error: 'Verification keys are not available',
                }),
            );
            expect(driveCrypto.verifyInvitation).toHaveBeenCalledWith(
                'keyPacket',
                { base64: 'keyPacketSignature' },
                [],
            );
        });
    });

    describe('decryptMember', () => {
        const encryptedMember = {
            uid: 'member-uid',
            invitationTime: new Date(),
            addedByEmail: 'inviter@example.com',
            inviteeEmail: 'member@example.com',
            role: MemberRole.Viewer,
            base64KeyPacket: 'keyPacket',
            base64KeyPacketSignature: 'keyPacketSignature',
        };

        beforeEach(() => {
            account.getPublicKeys = jest.fn().mockResolvedValue(['publicKey']);
            driveCrypto.verifyInvitation = jest.fn().mockResolvedValue({
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            });
        });

        it('should verify addedByEmail when signature is valid', async () => {
            const result = await cryptoService.decryptMember(encryptedMember);

            expect(result.addedByEmail).toEqual(resultOk('inviter@example.com'));
            expect(driveCrypto.verifyInvitation).toHaveBeenCalledWith('keyPacket', { base64: 'keyPacketSignature' }, [
                'publicKey',
            ]);
        });
    });

    describe('decryptExternalInvitation', () => {
        const encryptedInvitation = {
            uid: 'external-invitation-uid',
            invitationTime: new Date(),
            addedByEmail: 'inviter@example.com',
            inviteeEmail: 'invitee@example.com',
            role: MemberRole.Viewer,
            state: NonProtonInvitationState.Pending,
            base64Signature: 'externalSignature',
        };
        const sharePassphraseSessionKey = { data: new Uint8Array([1, 2, 3]) };

        beforeEach(() => {
            account.getPublicKeys = jest.fn().mockResolvedValue(['publicKey']);
            driveCrypto.verifyExternalInvitation = jest.fn().mockResolvedValue({
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            });
        });

        it('should verify addedByEmail when signature is valid', async () => {
            const result = await cryptoService.decryptExternalInvitation(
                encryptedInvitation,
                sharePassphraseSessionKey as SessionKey,
            );

            expect(result.addedByEmail).toEqual(resultOk('inviter@example.com'));
            expect(driveCrypto.verifyExternalInvitation).toHaveBeenCalledWith(
                'invitee@example.com',
                sharePassphraseSessionKey,
                'externalSignature',
                ['publicKey'],
            );
        });
    });

    describe('encryptBookmark', () => {
        const token = 'abc123token';
        const urlPassword = 'generatedPass';
        const customPassword = 'customPass123';

        beforeEach(() => {
            sharesService.getMyFilesShareMemberEmailKey = jest.fn().mockResolvedValue({
                addressId: 'addressId123',
                addressKey: 'addressKey1' as unknown as PrivateKey,
                addressKeyId: 'keyId1',
            });
            driveCrypto.encryptShareUrlPassword = jest.fn().mockResolvedValue('encryptedPassword');
        });

        it('should encrypt bookmark with token, url password and custom password', async () => {
            const result = await cryptoService.encryptBookmark(token, urlPassword, customPassword);

            expect(result).toEqual({
                token: 'abc123token',
                encryptedUrlPassword: 'encryptedPassword',
                addressId: 'addressId123',
                addressKeyId: 'keyId1',
            });
            expect(sharesService.getMyFilesShareMemberEmailKey).toHaveBeenCalled();
            expect(driveCrypto.encryptShareUrlPassword).toHaveBeenCalledWith(
                'generatedPasscustomPass123',
                'addressKey1',
                'addressKey1',
            );
        });

        it('should encrypt bookmark without custom password', async () => {
            const result = await cryptoService.encryptBookmark(token, urlPassword);

            expect(result).toEqual({
                token: 'abc123token',
                encryptedUrlPassword: 'encryptedPassword',
                addressId: 'addressId123',
                addressKeyId: 'keyId1',
            });
            expect(driveCrypto.encryptShareUrlPassword).toHaveBeenCalledWith(
                'generatedPass',
                'addressKey1',
                'addressKey1',
            );
        });

        it('should use primary key from share service', async () => {
            sharesService.getMyFilesShareMemberEmailKey = jest.fn().mockResolvedValue({
                addressId: 'addressId123',
                addressKey: 'addressKey3' as unknown as PrivateKey,
                addressKeyId: 'keyId3',
            });

            const result = await cryptoService.encryptBookmark(token, urlPassword, customPassword);

            expect(result.addressKeyId).toBe('keyId3');
            expect(driveCrypto.encryptShareUrlPassword).toHaveBeenCalledWith(
                'generatedPasscustomPass123',
                'addressKey3',
                'addressKey3',
            );
        });
    });
});
