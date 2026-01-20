import { ProtonDriveCache } from '../cache';
import { OpenPGPCrypto, PrivateKey, SessionKey, SRPModule } from '../crypto';
import { LatestEventIdProvider } from '../internal/events/interface';
import { ProtonDriveAccount } from './account';
import { ProtonDriveConfig } from './config';
import { FeatureFlagProvider } from './featureFlags';
import { ProtonDriveHTTPClient } from './httpClient';
import { Telemetry, MetricEvent } from './telemetry';

export type { Result } from './result';
export { resultOk, resultError } from './result';
export type { ProtonDriveAccount, ProtonDriveAccountAddress } from './account';
export type { Author, UnverifiedAuthorError, AnonymousUser } from './author';
export type { ProtonDriveConfig } from './config';
export type { Device, DeviceOrUid } from './devices';
export type { FeatureFlagProvider } from './featureFlags';
export { DeviceType } from './devices';
export type { FileDownloader, DownloadController, SeekableReadableStream } from './download';
export type {
    DriveListener,
    LatestEventIdProvider,
    DriveEvent,
    NodeEvent,
    FastForwardEvent,
    TreeRefreshEvent,
    TreeRemovalEvent,
    SharedWithMeUpdated,
} from './events';
export { DriveEventType, SDKEvent } from './events';
export type {
    ProtonDriveHTTPClient,
    ProtonDriveHTTPClientJsonRequest,
    ProtonDriveHTTPClientBlobRequest,
} from './httpClient';
export type {
    MaybeNode,
    NodeEntity,
    DegradedNode,
    MaybeMissingNode,
    MissingNode,
    InvalidNameError,
    Revision,
    NodeOrUid,
    RevisionOrUid,
    NodeResult,
    NodeResultWithNewUid,
    Membership,
} from './nodes';
export { NodeType, MemberRole, RevisionState } from './nodes';
export type { MaybePhotoNode, MaybeMissingPhotoNode, PhotoNode, DegradedPhotoNode, PhotoAttributes } from './photos';
export type {
    ProtonInvitation,
    ProtonInvitationWithNode,
    NonProtonInvitation,
    Member,
    PublicLink,
    MaybeBookmark,
    Bookmark,
    DegradedBookmark,
    ProtonInvitationOrUid,
    NonProtonInvitationOrUid,
    BookmarkOrUid,
    ShareNodeSettings,
    UnshareNodeSettings,
    ShareMembersSettings,
    SharePublicLinkSettings,
    SharePublicLinkSettingsObject,
    ShareResult,
} from './sharing';
export { NonProtonInvitationState } from './sharing';
export type {
    Telemetry,
    Logger,
    MetricAPIRetrySucceededEvent,
    MetricUploadEvent,
    MetricsUploadErrorType,
    MetricDownloadEvent,
    MetricsDownloadErrorType,
    MetricDecryptionErrorEvent,
    MetricsDecryptionErrorField,
    MetricVerificationErrorEvent,
    MetricVerificationErrorField,
    MetricBlockVerificationErrorEvent,
    MetricVolumeEventsSubscriptionsChangedEvent,
    MetricEvent,
} from './telemetry';
export { MetricVolumeType } from './telemetry';
export type { FileUploader, UploadController, UploadMetadata } from './upload';
export type { Thumbnail, ThumbnailResult } from './thumbnail';
export { ThumbnailType } from './thumbnail';

export type ProtonDriveTelemetry = Telemetry<MetricEvent>;
export type ProtonDriveEntitiesCache = ProtonDriveCache<string>;
export type ProtonDriveCryptoCache = ProtonDriveCache<CachedCryptoMaterial>;
export type CachedCryptoMaterial = {
    nodeKeys?: {
        // Passphrase should not be needed to keep, sessionKey should be enough.
        // We will improve this in the future.
        passphrase: string;
        key: PrivateKey;
        passphraseSessionKey: SessionKey;
        contentKeyPacketSessionKey?: SessionKey;
        hashKey?: Uint8Array<ArrayBuffer>;
    };
    shareKey?: {
        key: PrivateKey;
        passphraseSessionKey: SessionKey;
    };
    publicShareKey?: {
        key: PrivateKey;
    };
};

export interface ProtonDriveClientContructorParameters {
    httpClient: ProtonDriveHTTPClient;
    entitiesCache: ProtonDriveEntitiesCache;
    cryptoCache: ProtonDriveCryptoCache;
    account: ProtonDriveAccount;
    openPGPCryptoModule: OpenPGPCrypto;
    srpModule: SRPModule;
    config?: ProtonDriveConfig;
    telemetry?: ProtonDriveTelemetry;
    featureFlagProvider?: FeatureFlagProvider;
    latestEventIdProvider?: LatestEventIdProvider;
}
