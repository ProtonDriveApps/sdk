import { ProtonDriveCache } from '../cache';
import { OpenPGPCrypto } from '../crypto';
import { ProtonDriveAccount, ProtonDriveHTTPClient, ProtonDriveConfig, GetLogger, Metrics } from './constructor';
import { Devices } from './devices';
import { Download } from './download';
import { Events } from './events';
import { Nodes, NodesManagement, TrashManagement, Revisions } from './nodes';
import { Sharing, SharingManagement } from './sharing';
import { Upload } from './upload';

export type { Result } from './result';
export { resultOk, resultError } from './result';
export type { ProtonDriveAccount, ProtonDriveHTTPClient, ProtonDriveConfig, GetLogger, Logger, Metrics, MetricsShareType, MetricsUploadErrorType, MetricsDownloadErrorType } from './constructor';
export type { Device, DeviceOrUid } from './devices';
export type { FileDownloader, DownloadController } from './download';
export type { NodeEvent, DeviceEvent, SDKEvent, DeviceEventCallback, NodeEventCallback } from './events';
export type { NodeEntity, InvalidNameError, UnverifiedAuthorError, AnonymousUser, Revision, NodeOrUid, RevisionOrUid, NodesResults, NodeErrorResult } from './nodes';
export { NodeType, MemberRole } from './nodes';
export type { ProtonInvitation, NonProtonInvitation, NonProtonInvitationState, Member, PublicLink, Bookmark, ProtonInvitationOrUid, NonProtonInvitationOrUid, BookmarkOrUid, ShareNodeSettings, UnshareNodeSettings, ShareMembersSettings, ShareResult } from './sharing';
export { ShareRole } from './sharing';
export type { Fileuploader, UploadController, Thumbnail, ThumbnailType, UploadMetadata } from './upload';

export interface ProtonDriveClientContructorParameters {
    entitiesCache: ProtonDriveCache,
    cryptoCache: ProtonDriveCache,
    account: ProtonDriveAccount,
    httpClient: ProtonDriveHTTPClient,
    getLogger?: GetLogger,
    config?: ProtonDriveConfig,
    metrics?: Metrics,
    openPGPCryptoModule: OpenPGPCrypto,
    acceptNoGuaranteeWithCustomModules?: boolean,
};

export interface ProtonDriveClientInterface extends Devices, Download, Events, Nodes, NodesManagement, TrashManagement, Revisions, Sharing, SharingManagement, Upload {};
