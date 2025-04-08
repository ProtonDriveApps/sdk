import { ProtonDriveCache } from '../cache';
import { OpenPGPCrypto, PrivateKey, SessionKey } from '../crypto';
import { ProtonDriveAccount } from './account';
import { Devices } from './devices';
import { Download } from './download';
import { Events } from './events';
import { ProtonDriveHTTPClient, ProtonDriveConfig } from './httpClient';
import { Telemetry, MetricEvent } from './telemetry';
import { Upload } from './upload';

export type { Result } from './result';
export { resultOk, resultError } from './result';
export type { ProtonDriveAccount, ProtonDriveAccountAddress } from './account';
export type { Author,UnverifiedAuthorError, AnonymousUser } from './author';
export type { Device, DeviceOrUid } from './devices';
export type { FileDownloader, DownloadController } from './download';
export type { NodeEvent, DeviceEvent, SDKEvent, DeviceEventCallback, NodeEventCallback } from './events';
export type { ProtonDriveHTTPClient, ProtonDriveConfig } from './httpClient';
export type { MaybeNode, NodeEntity, DegradedNode, InvalidNameError, Revision, NodeOrUid, RevisionOrUid, NodeResult } from './nodes';
export { NodeType, MemberRole, RevisionState } from './nodes';
export type { ProtonInvitation, ProtonInvitationWithNode, NonProtonInvitation, Member, PublicLink, Bookmark, ProtonInvitationOrUid, NonProtonInvitationOrUid, BookmarkOrUid, ShareNodeSettings, UnshareNodeSettings, ShareMembersSettings, SharePublicLinkSettings, ShareResult } from './sharing';
export { NonProtonInvitationState } from './sharing';
export type { Telemetry, Logger, MetricAPIRetrySucceededEvent, MetricUploadEvent, MetricsUploadErrorType, MetricDownloadEvent, MetricsDownloadErrorType, MetricDecryptionErrorEvent, MetricsDecryptionErrorField, MetricVerificationErrorEvent, MetricVerificationErrorField, MetricVolumeEventsSubscriptionsChangedEvent, MetricEvent, MetricContext } from './telemetry';
export type { Fileuploader, UploadController, Thumbnail, ThumbnailType, UploadMetadata } from './upload';

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
    config?: ProtonDriveConfig,
    telemetry?: ProtonDriveTelemetry,
};

// Helper interface to make sure that all methods are correctly implemented eventually.
// In the end this will be deleted and the ProtonDriveClient will implement all methods directly.
export interface ProtonDriveClientInterface extends Devices, Download, Events, Upload {};
