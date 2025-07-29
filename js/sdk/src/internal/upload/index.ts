import { ProtonDriveTelemetry, UploadMetadata } from '../../interface';
import { DriveAPIService } from '../apiService';
import { DriveCrypto } from '../../crypto';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';
import { FileUploader, FileRevisionUploader } from './fileUploader';
import { NodesService, SharesService } from './interface';
import { UploadManager } from './manager';
import { UploadQueue } from './queue';
import { UploadTelemetry } from './telemetry';

/**
 * Provides facade for the upload module.
 *
 * The upload module is responsible for handling file uploads, including
 * metadata generation, content upload, API communication, encryption,
 * and verifications.
 */
export function initUploadModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    sharesService: SharesService,
    nodesService: NodesService,
    clientUid?: string,
) {
    const api = new UploadAPIService(apiService, clientUid);
    const cryptoService = new UploadCryptoService(driveCrypto, nodesService);

    const uploadTelemetry = new UploadTelemetry(telemetry, sharesService);
    const manager = new UploadManager(telemetry, api, cryptoService, nodesService, clientUid);

    const queue = new UploadQueue();

    /**
     * Returns a FileUploader instance that can be used to upload a file to
     * a parent folder.
     *
     * This operation does not call the API, it only returns a FileUploader
     * instance when the upload queue has capacity.
     */
    async function getFileUploader(
        parentFolderUid: string,
        name: string,
        metadata: UploadMetadata,
        signal?: AbortSignal,
    ): Promise<FileUploader> {
        await queue.waitForCapacity(signal);

        const onFinish = () => {
            queue.releaseCapacity();
        };

        return new FileUploader(
            uploadTelemetry,
            api,
            cryptoService,
            manager,
            parentFolderUid,
            name,
            metadata,
            onFinish,
            signal,
        );
    }

    /**
     * Returns a FileUploader instance that can be used to upload a new
     * revision of a file.
     *
     * This operation does not call the API, it only returns a
     * FileRevisionUploader instance when the upload queue has capacity.
     */
    async function getFileRevisionUploader(
        nodeUid: string,
        metadata: UploadMetadata,
        signal?: AbortSignal,
    ): Promise<FileRevisionUploader> {
        await queue.waitForCapacity(signal);

        const onFinish = () => {
            queue.releaseCapacity();
        };

        return new FileRevisionUploader(
            uploadTelemetry,
            api,
            cryptoService,
            manager,
            nodeUid,
            metadata,
            onFinish,
            signal,
        );
    }

    return {
        getFileUploader,
        getFileRevisionUploader,
    };
}
