
import { PrivateKey, PublicKey } from '../crypto';

export interface ProtonDriveAccount {
    getOwnPrimaryKey(): Promise<{ email: string, addressKey: PrivateKey, addressId: string, addressKeyId: string }>,
    // TODO: do we want to break it down to email vs address ID methods?
    getOwnPrivateKey(emailOrAddressId: string): Promise<PrivateKey>,
    getOwnPrivateKeys(emailOrAddressId: string): Promise<PrivateKey[]>,
    getPublicKeys(email: string): Promise<PublicKey[]>,
}

export interface ProtonDriveHTTPClient {
    fetch(request: Request, signal?: AbortSignal): Promise<Response>,
}

export type GetLogger = (name: string) => Logger;

export interface Logger {
    debug(msg: string, ...x: any[]): void; // eslint-disable-line @typescript-eslint/no-explicit-any
    info(msg: string, ...x: any[]): void; // eslint-disable-line @typescript-eslint/no-explicit-any
    warn(msg: string, ...x: any[]): void; // eslint-disable-line @typescript-eslint/no-explicit-any
    error(msg: string, ...x: any[]): void; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type ProtonDriveConfig = {
    baseUrl?: string,
    language?: string,
    observabilityEnabled?: boolean,
    uploadTimeout?: number,
    uploadQueueLimitItems?: number,
    downloadTimeout?: number,
    downloadQueueLimitItems?: number,
}

export type MetricsShareType = 'main' | 'device' | 'shared' | 'shared_public' | 'photo';
export type MetricsUploadErrorType =
    'free_space_exceeded' |
    'too_many_children' |
    'network_error' |
    'server_error' |
    'integrity_error' |
    'rate_limited' |
    '4xx' |
    '5xx' |
    'unknown';
export type MetricsDownloadErrorType =
    'server_error' |
    'network_error' |
    'decryption_error' |
    'rate_limited' |
    '4xx' |
    '5xx' |
    'unknown';

export interface Metrics {
    uploadSucceeded(shareType: MetricsShareType, retry: boolean, uploadedSize: number, fileSize: number): void,
    uploadFailed(shareType: MetricsShareType, retry: boolean, uploadedSize: number, fileSize: number, error: MetricsUploadErrorType): void,
    
    downloadSucceeded(shareType: MetricsShareType, retry: boolean, downloadedSize: number, fileSize: number): void,
    downloadFailed(shareType: MetricsShareType, retry: boolean, downloadedSize: number, fileSize: number, error: MetricsDownloadErrorType): void,
    
    decryptionFailed(
        shareType: MetricsShareType,
        entity: 'share' | 'node' | 'content',
        fromBefore2024?: boolean
    ): void,
    varificationFailed(
        shareType: MetricsShareType,
        verificationKey: 'ShareAddress' | 'NameSignatureEmail' | 'SignatureEmail' | 'NodeKey' | 'other',
        addressMatchingDefaultShare?: boolean,
        fromBefore2024?: boolean
    ): void,

    numberOfVolumeEventsSubscriptionsChanged(number: number): void,
}
