import { ProtonDriveCache } from '../cache';
import { OpenPGPCrypto, PrivateKey, SessionKey, SRPModule } from '../crypto';
import { ProtonDriveAccount } from './account';
import { ProtonDriveHTTPClient, ProtonDriveConfig } from './httpClient';
import { Telemetry, MetricEvent } from './telemetry';

export type { Result } from './result';
export { resultOk, resultError } from './result';
export type { ProtonDriveAccount, ProtonDriveAccountAddress } from './account';
export type { Author, UnverifiedAuthorError, AnonymousUser } from './author';
export type { Device, DeviceOrUid } from './devices';
export { DeviceType } from './devices';
export type { FileDownloader, DownloadController } from './download';
export type { NodeEvent, DeviceEvent, DeviceEventCallback, NodeEventCallback } from './events';
export { SDKEvent } from './events';
export type { ProtonDriveHTTPClient, ProtonDriveHTTPClientJsonOptions, ProtonDriveHTTPClientBlobOptions, ProtonDriveConfig } from './httpClient';
export type { MaybeNode, NodeEntity, DegradedNode, MaybeMissingNode, MissingNode, InvalidNameError, Revision, NodeOrUid, RevisionOrUid, NodeResult } from './nodes';
export { NodeType, MemberRole, RevisionState } from './nodes';
export type { ProtonInvitation, ProtonInvitationWithNode, NonProtonInvitation, Member, PublicLink, MaybeBookmark, Bookmark, DegradedBookmark, ProtonInvitationOrUid, NonProtonInvitationOrUid, BookmarkOrUid, ShareNodeSettings, UnshareNodeSettings, ShareMembersSettings, SharePublicLinkSettings, SharePublicLinkSettingsObject, ShareResult } from './sharing';
export { NonProtonInvitationState } from './sharing';
export type { Telemetry, Logger, MetricAPIRetrySucceededEvent, MetricUploadEvent, MetricsUploadErrorType, MetricDownloadEvent, MetricsDownloadErrorType, MetricDecryptionErrorEvent, MetricsDecryptionErrorField, MetricVerificationErrorEvent, MetricVerificationErrorField, MetricBlockVerificationErrorEvent, MetricVolumeEventsSubscriptionsChangedEvent, MetricEvent } from './telemetry';
export { MetricVolumeType } from './telemetry';
export type { FileUploader, FileRevisionUploader, UploadController, UploadMetadata } from './upload';
export type { Thumbnail, ThumbnailResult } from './thumbnail';
export { ThumbnailType } from './thumbnail';

export type ProtonDriveTelemetry = Telemetry<MetricEvent>;
export type ProtonDriveEntitiesCache = ProtonDriveCache<string>;
export type ProtonDriveCryptoCache = ProtonDriveCache<CachedCryptoMaterial>;
export type CachedCryptoMaterial = {
    passphrase?: string,
    key: PrivateKey,
    passphraseSessionKey: SessionKey,
    hashKey?: Uint8Array,
};

export interface ProtonDriveClientContructorParameters {
    httpClient: ProtonDriveHTTPClient,
    entitiesCache: ProtonDriveEntitiesCache,
    cryptoCache: ProtonDriveCryptoCache,
    account: ProtonDriveAccount,
    openPGPCryptoModule: OpenPGPCrypto,
    srpModule: SRPModule,
    config?: ProtonDriveConfig,
    telemetry?: ProtonDriveTelemetry,
};
