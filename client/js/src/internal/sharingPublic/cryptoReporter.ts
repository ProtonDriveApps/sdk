import { c } from 'ttag';

import { VERIFICATION_STATUS } from '../../crypto';
import {
    AnonymousUser,
    Author,
    Logger,
    MetricsDecryptionErrorField,
    MetricVerificationErrorField,
    ProtonDriveTelemetry,
    resultError,
    resultOk,
} from '../../interface';
import { getVerificationMessage, isNotApplicationError } from '../errors';
import { getMetricItemCreator, getMetricRecency } from '../telemetry';

export class SharingPublicCryptoReporter {
    private logger: Logger;
    private telemetry: ProtonDriveTelemetry;

    constructor(telemetry: ProtonDriveTelemetry) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('sharingPublic-crypto');
    }

    async handleClaimedAuthor(
        node: { uid: string; creationTime: Date; thirdParty?: boolean; sdk?: boolean },
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
        node: { uid: string; creationTime: Date; thirdParty?: boolean; sdk?: boolean },
        field: MetricsDecryptionErrorField,
        error: unknown,
    ) {
        if (isNotApplicationError(error)) {
            return;
        }

        const recency = getMetricRecency(node.creationTime);
        const createdBy = getMetricItemCreator(node.thirdParty, node.sdk);

        this.logger.error(
            `Failed to decrypt URL access node ${node.uid} (recency: ${recency}, created by: ${createdBy})`,
            error,
        );

        this.telemetry.recordMetric({
            eventName: 'decryptionError',
            field,
            recency,
            createdBy,
            error,
            uid: node.uid,
        });
    }

    reportVerificationError() {
        // Authors or signatures are not provided on URL accesses.
        // We do not report any signature verification errors at this moment.
    }
}
