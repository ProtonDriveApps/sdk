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
import { EncryptedNode, SharesService } from './interface';

type MetricItem = {
    uid: string;
    creationTime: Date;
    thirdParty?: boolean;
    sdk?: boolean;
};

export class NodesCryptoReporter {
    private logger: Logger;

    private reportedDecryptionErrors = new Set<string>();
    private reportedVerificationErrors = new Set<string>();

    constructor(
        private telemetry: ProtonDriveTelemetry,
        private shareService: SharesService,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('nodes-crypto');
        this.shareService = shareService;
    }

    async handleClaimedAuthor(
        node: MetricItem,
        field: MetricVerificationErrorField,
        signatureType: string,
        verified: VERIFICATION_STATUS,
        verificationErrors?: Error[],
        claimedAuthor?: string | AnonymousUser,
        notAvailableVerificationKeys = false,
    ): Promise<Author> {
        const author = handleClaimedAuthor(
            signatureType,
            verified,
            verificationErrors,
            claimedAuthor,
            notAvailableVerificationKeys,
        );
        if (!author.ok) {
            void this.reportVerificationError(node, field, verificationErrors, claimedAuthor);
        }
        return author;
    }

    async reportVerificationError(
        node: MetricItem,
        field: MetricVerificationErrorField,
        verificationErrors?: Error[],
        claimedAuthor?: string | AnonymousUser,
    ) {
        if (this.reportedVerificationErrors.has(node.uid)) {
            return;
        }
        this.reportedVerificationErrors.add(node.uid);

        const recency = getMetricRecency(node.creationTime);
        const createdBy = getMetricItemCreator(node.thirdParty, node.sdk);

        let addressMatchingDefaultShare;
        try {
            const { email } = await this.shareService.getMyFilesShareMemberEmailKey();
            addressMatchingDefaultShare = claimedAuthor ? claimedAuthor === email : undefined;
        } catch (error: unknown) {
            this.logger.error('Failed to check if claimed author matches default share', error);
        }

        this.logger.warn(
            `Failed to verify ${field} for node ${node.uid} (recency: ${recency}, created by: ${createdBy}, matching address: ${addressMatchingDefaultShare})`,
        );

        this.telemetry.recordMetric({
            eventName: 'verificationError',
            field,
            addressMatchingDefaultShare,
            recency,
            createdBy,
            error: verificationErrors?.map((e) => e.message).join(', '),
            uid: node.uid,
        });
    }

    async reportDecryptionError(node: EncryptedNode, field: MetricsDecryptionErrorField, error: unknown) {
        if (isNotApplicationError(error)) {
            return;
        }

        if (this.reportedDecryptionErrors.has(node.uid)) {
            return;
        }

        const recency = getMetricRecency(node.creationTime);
        const createdBy = getMetricItemCreator(node.thirdParty, node.sdk);

        this.logger.error(`Failed to decrypt node ${node.uid} (recency: ${recency}, created by: ${createdBy})`, error);

        this.telemetry.recordMetric({
            eventName: 'decryptionError',
            field,
            recency,
            createdBy,
            error,
            uid: node.uid,
        });
        this.reportedDecryptionErrors.add(node.uid);
    }
}

/**
 * @param signatureType - Must be translated before calling this function.
 */
function handleClaimedAuthor(
    signatureType: string,
    verified: VERIFICATION_STATUS,
    verificationErrors?: Error[],
    claimedAuthor?: string | AnonymousUser,
    notAvailableVerificationKeys = false,
): Author {
    if (!claimedAuthor && notAvailableVerificationKeys) {
        return resultOk(null as AnonymousUser);
    }

    if (verified === VERIFICATION_STATUS.SIGNED_AND_VALID) {
        return resultOk(claimedAuthor || (null as AnonymousUser));
    }

    return resultError({
        claimedAuthor,
        error: getVerificationMessage(verified, verificationErrors, signatureType, notAvailableVerificationKeys),
    });
}
