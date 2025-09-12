import { c } from 'ttag';

import { DriveCrypto, PrivateKey, VERIFICATION_STATUS } from '../../crypto';
import { getVerificationMessage } from '../errors';
import {
    resultOk,
    resultError,
    Author,
    AnonymousUser,
    ProtonDriveTelemetry,
    MetricVerificationErrorField,
    MetricVolumeType,
    MetricsDecryptionErrorField,
    Logger,
    ProtonDriveAccount,
} from '../../interface';
import { NodesCryptoService } from '../nodes/cryptoService';
import { EncryptedShareCrypto } from './interface';

export class SharingPublicCryptoService extends NodesCryptoService {
    constructor(
        telemetry: ProtonDriveTelemetry,
        driveCrypto: DriveCrypto,
        account: ProtonDriveAccount,
        private password: string,
    ) {
        super(telemetry, driveCrypto, account, new SharingPublicCryptoReporter(telemetry));
        this.password = password;
    }

    async decryptPublicLinkShareKey(encryptedShare: EncryptedShareCrypto): Promise<PrivateKey> {
        const { key: shareKey } = await this.driveCrypto.decryptKeyWithSrpPassword(
            this.password,
            encryptedShare.base64UrlPasswordSalt,
            encryptedShare.armoredKey,
            encryptedShare.armoredPassphrase,
        );
        return shareKey;
    }
}

class SharingPublicCryptoReporter {
    private logger: Logger;
    private telemetry: ProtonDriveTelemetry;

    constructor(telemetry: ProtonDriveTelemetry) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('sharingPublic-crypto');
    }

    async handleClaimedAuthor(
        node: { uid: string; creationTime: Date },
        field: MetricVerificationErrorField,
        signatureType: string,
        verified: VERIFICATION_STATUS,
        verificationErrors?: Error[],
        claimedAuthor?: string,
        notAvailableVerificationKeys = false,
    ): Promise<Author> {
        if (verified === VERIFICATION_STATUS.SIGNED_AND_VALID) {
            return resultOk(claimedAuthor || (null as AnonymousUser));
        }

        return resultError({
            claimedAuthor,
            error: !claimedAuthor
                ? c('Info').t`Author is not provided on public link`
                : getVerificationMessage(verified, verificationErrors, signatureType, notAvailableVerificationKeys),
        });
    }

    reportDecryptionError(
        node: { uid: string; creationTime: Date },
        field: MetricsDecryptionErrorField,
        error: unknown,
    ) {
        const fromBefore2024 = node.creationTime < new Date('2024-01-01');

        this.logger.error(
            `Failed to decrypt public link node ${node.uid} (from before 2024: ${fromBefore2024})`,
            error,
        );

        this.telemetry.recordMetric({
            eventName: 'decryptionError',
            volumeType: MetricVolumeType.SharedPublic,
            field,
            fromBefore2024,
            error,
            uid: node.uid,
        });
    }

    reportVerificationError() {
        // Authors or signatures are not provided on public links.
        // We do not report any signature verification errors at this moment.
    }
}
