import { VERIFICATION_STATUS } from '../../crypto';
import {
    resultOk,
    resultError,
    Author,
    AnonymousUser,
    ProtonDriveTelemetry,
    Logger,
    MetricsDecryptionErrorField,
    MetricVerificationErrorField,
} from '../../interface';
import { getVerificationMessage } from '../errors';
import { splitNodeUid } from '../uids';
import {
    EncryptedNode,
    SharesService,
} from './interface';

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
        node: { uid: string; creationTime: Date },
        field: MetricVerificationErrorField,
        signatureType: string,
        verified: VERIFICATION_STATUS,
        verificationErrors?: Error[],
        claimedAuthor?: string,
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
        node: { uid: string; creationTime: Date },
        field: MetricVerificationErrorField,
        verificationErrors?: Error[],
        claimedAuthor?: string,
    ) {
        if (this.reportedVerificationErrors.has(node.uid)) {
            return;
        }
        this.reportedVerificationErrors.add(node.uid);

        const fromBefore2024 = node.creationTime < new Date('2024-01-01');

        let addressMatchingDefaultShare, volumeType;
        try {
            const { volumeId } = splitNodeUid(node.uid);
            const { email } = await this.shareService.getMyFilesShareMemberEmailKey();
            addressMatchingDefaultShare = claimedAuthor ? claimedAuthor === email : undefined;
            volumeType = await this.shareService.getVolumeMetricContext(volumeId);
        } catch (error: unknown) {
            this.logger.error('Failed to check if claimed author matches default share', error);
        }

        this.logger.warn(
            `Failed to verify ${field} for node ${node.uid} (from before 2024: ${fromBefore2024}, matching address: ${addressMatchingDefaultShare})`,
        );

        this.telemetry.recordMetric({
            eventName: 'verificationError',
            volumeType,
            field,
            addressMatchingDefaultShare,
            fromBefore2024,
            error: verificationErrors?.map((e) => e.message).join(', '),
            uid: node.uid,
        });
    }

    async reportDecryptionError(node: EncryptedNode, field: MetricsDecryptionErrorField, error: unknown) {
        if (this.reportedDecryptionErrors.has(node.uid)) {
            return;
        }

        const fromBefore2024 = node.creationTime < new Date('2024-01-01');

        let volumeType;
        try {
            const { volumeId } = splitNodeUid(node.uid);
            volumeType = await this.shareService.getVolumeMetricContext(volumeId);
        } catch (error: unknown) {
            this.logger.error('Failed to get metric context', error);
        }

        this.logger.error(`Failed to decrypt node ${node.uid} (from before 2024: ${fromBefore2024})`, error);

        this.telemetry.recordMetric({
            eventName: 'decryptionError',
            volumeType,
            field,
            fromBefore2024,
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
    claimedAuthor?: string,
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
