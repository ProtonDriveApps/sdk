import { ProtonDriveCache } from '../cache';
import { OpenPGPCrypto, PrivateKey, SessionKey, SRPModule } from '../crypto';
import { LatestEventIdProvider } from '../internal/events/interface';
import { ProtonDriveAccount } from './account';
import { ProtonDriveConfig } from './config';
import { FeatureFlagProvider } from './featureFlags';
import { ProtonDriveHTTPClient } from './httpClient';
import { MetricEvent, Telemetry } from './telemetry';

export type { ProtonDriveAccount, ProtonDriveAccountAddress } from './account';
export type { AnonymousUser, Author, UnverifiedAuthorError } from './author';
export type { ProtonDriveConfig } from './config';
export type { Device, DeviceOrUid } from './devices';
export { DeviceType } from './devices';
export type { DownloadController, FileDownloader, SeekableReadableStream } from './download';
export type {
    DriveEvent,
    DriveListener,
    FastForwardEvent,
    LatestEventIdProvider,
    NodeEvent,
    SharedWithMeUpdated,
    TreeRefreshEvent,
    TreeRemovalEvent,
} from './events';
export { DriveEventType, SDKEvent } from './events';
export type { FeatureFlagProvider } from './featureFlags';
export { FeatureFlags } from './featureFlags';
export type {
    ProtonDriveHTTPClient,
    ProtonDriveHTTPClientBlobRequest,
    ProtonDriveHTTPClientJsonRequest,
} from './httpClient';
export type {
    InvalidNameError,
    MaybeMissingNode,
    Membership,
    MissingNode,
    NodeEntity,
    NodeOrUid,
    NodeResult,
    NodeResultWithNewUid,
    Revision,
    RevisionOrUid,
} from './nodes';
export { MemberRole, NodeType, RevisionState } from './nodes';
export type { AlbumAttributes, MaybeMissingPhotoNode, PhotoAttributes, PhotoNode } from './photos';
export { PhotoTag } from './photos';
export type { Result } from './result';
export { resultError, resultOk } from './result';
export type {
    Bookmark,
    BookmarkOrUid,
    DegradedBookmark,
    MaybeBookmark,
    Member,
    NonProtonInvitation,
    NonProtonInvitationOrUid,
    ProtonInvitation,
    ProtonInvitationOrUid,
    ProtonInvitationWithNode,
    PublicLink,
    ReportDirectShareAbuseSettings,
    ReportPublicLinkShareAbuseSettings,
    ShareMembersSettings,
    ShareNodeSettings,
    SharePublicLinkSettings,
    SharePublicLinkSettingsObject,
    ShareResult,
    UnshareNodeSettings,
} from './sharing';
export { AbuseCategory, NonProtonInvitationState } from './sharing';
export type {
    Logger,
    MetricAPIRetrySucceededEvent,
    MetricBlockVerificationErrorEvent,
    MetricDebounceLongWaitEvent,
    MetricDecryptionErrorEvent,
    MetricDownloadEvent,
    MetricEvent,
    MetricPerformanceEvent,
    MetricsDecryptionErrorField,
    MetricsDownloadErrorType,
    MetricsUploadErrorType,
    MetricUploadEvent,
    MetricVerificationErrorEvent,
    MetricVerificationErrorField,
    MetricVolumeEventsSubscriptionsChangedEvent,
    Telemetry,
} from './telemetry';
export { MetricVolumeType } from './telemetry';
export type { Thumbnail, ThumbnailResult } from './thumbnail';
export { ThumbnailType } from './thumbnail';
export type { FileUploader, UploadController, UploadMetadata } from './upload';

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
        contentKeyPacket?: Uint8Array<ArrayBuffer>;
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
