import { ProtonDriveCache } from '../cache';
import { OpenPGPCrypto, PrivateKey, SessionKey } from '../crypto';
import { ProtonDriveAccount, ProtonDriveHTTPClient, ProtonDriveConfig } from './constructor';
import { Devices } from './devices';
import { Download } from './download';
import { Events } from './events';
import { Nodes, NodesManagement, TrashManagement, Revisions } from './nodes';
import { Sharing, SharingManagement } from './sharing';
import { Telemetry, MetricEvent } from './telemetry';
import { Upload } from './upload';

export type { Result } from './result';
export { resultOk, resultError } from './result';
export type { ProtonDriveAccount, ProtonDriveAccountAddress, ProtonDriveHTTPClient, ProtonDriveConfig } from './constructor';
export type { Device, DeviceOrUid } from './devices';
export type { FileDownloader, DownloadController } from './download';
export type { NodeEvent, DeviceEvent, SDKEvent, DeviceEventCallback, NodeEventCallback } from './events';
export type { Author, NodeEntity, InvalidNameError, UnverifiedAuthorError, AnonymousUser, Revision, NodeOrUid, RevisionOrUid, NodeResult } from './nodes';
export { NodeType, MemberRole } from './nodes';
export type { ProtonInvitation, ProtonInvitationWithNode, NonProtonInvitation, Member, PublicLink, Bookmark, ProtonInvitationOrUid, NonProtonInvitationOrUid, BookmarkOrUid, ShareNodeSettings, UnshareNodeSettings, ShareMembersSettings, SharePublicLinkSettings, ShareResult } from './sharing';
export { NonProtonInvitationState } from './sharing';
export type { Telemetry, Logger, MetricUploadEvent, MetricDownloadEvent, MetricDecryptionErrorEvent, MetricVerificationErrorEvent, MetricVolumeEventsSubscriptionsChangedEvent } from './telemetry';
export type { Fileuploader, UploadController, Thumbnail, ThumbnailType, UploadMetadata } from './upload';

export type ProtonDriveTelemetry = Telemetry<MetricEvent>;
export type ProtonDriveEntitiesCache = ProtonDriveCache<string>;
export type ProtonDriveCryptoCache = ProtonDriveCache<CachedCryptoMaterial>;
export type CachedCryptoMaterial = {
    passphrase?: string,
    key: PrivateKey,
    sessionKey: SessionKey,
    hashKey?: Uint8Array,
};

export interface ProtonDriveClientContructorParameters {
    entitiesCache: ProtonDriveEntitiesCache,
    cryptoCache: ProtonDriveCryptoCache,
    account: ProtonDriveAccount,
    httpClient: ProtonDriveHTTPClient,
    config?: ProtonDriveConfig,
    telemetry?: ProtonDriveTelemetry,
    openPGPCryptoModule: OpenPGPCrypto,
    acceptNoGuaranteeWithCustomModules?: boolean,
};

export interface ProtonDriveClientInterface extends Devices, Download, Events, Nodes, NodesManagement, TrashManagement, Revisions, Sharing, SharingManagement, Upload {};
