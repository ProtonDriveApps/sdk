import { FeatureFlagProvider, FeatureFlags, ProtonDriveTelemetry, UploadMetadata } from '../../interface';
import type { FileUploader } from '../../interface';
import { DriveAPIService } from '../apiService';
import { DriveCrypto } from '../../crypto';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';
import { FileUploader as FileUploaderClass, FileRevisionUploader } from './fileUploader';
import { NodesService, SharesService } from './interface';
import { UploadManager } from './manager';
import { UploadQueue } from './queue';
import { SmallFileRevisionUploader, SmallFileUploader } from './smallFileUploader';
import { UploadTelemetry } from './telemetry';
import { UploadTuningOptions } from './options';
import { FILE_CHUNK_SIZE } from './streamUploader';

const SMALL_FILE_SIZE_LIMIT = 128 * 1024; // 128 KiB

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
    featureFlagProvider: FeatureFlagProvider,
    clientUid?: string,
    allowSmallFileUpload: boolean = true,
    tuning?: UploadTuningOptions,
) {
    const api = new UploadAPIService(apiService, clientUid);
    const cryptoService = new UploadCryptoService(telemetry, driveCrypto, nodesService, featureFlagProvider);

    const uploadTelemetry = new UploadTelemetry(telemetry, sharesService);
    const manager = new UploadManager(telemetry, api, cryptoService, nodesService, clientUid);

    const queue = new UploadQueue(
        tuning?.maxConcurrentFileUploads,
        tuning?.maxConcurrentUploadSizeInBlocks
            ? tuning.maxConcurrentUploadSizeInBlocks * FILE_CHUNK_SIZE
            : undefined,
    );

    async function useSmallFileUpload(metadata: UploadMetadata): Promise<boolean> {
        const isEnabled =
            allowSmallFileUpload && (await featureFlagProvider.isEnabled(FeatureFlags.DriveSmallFileUpload));
        if (!isEnabled) {
            return false;
        }
        return metadata.expectedSize < SMALL_FILE_SIZE_LIMIT;
    }

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
        await queue.waitForCapacity(metadata.expectedSize, signal);

        const onFinish = () => {
            queue.releaseCapacity(metadata.expectedSize);
        };

        if (await useSmallFileUpload(metadata)) {
            return new SmallFileUploader(
                uploadTelemetry,
                api,
                cryptoService,
                manager,
                metadata,
                onFinish,
                signal,
                parentFolderUid,
                name,
                tuning,
            );
        }

        return new FileUploaderClass(
            uploadTelemetry,
            api,
            cryptoService,
            manager,
            parentFolderUid,
            name,
            metadata,
            onFinish,
            signal,
            tuning,
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
    ): Promise<FileUploader> {
        await queue.waitForCapacity(metadata.expectedSize, signal);

        const onFinish = () => {
            queue.releaseCapacity(metadata.expectedSize);
        };

        if (await useSmallFileUpload(metadata)) {
            return new SmallFileRevisionUploader(
                uploadTelemetry,
                api,
                cryptoService,
                manager,
                metadata,
                onFinish,
                signal,
                nodeUid,
                tuning,
            );
        }

        return new FileRevisionUploader(
            uploadTelemetry,
            api,
            cryptoService,
            manager,
            nodeUid,
            metadata,
            onFinish,
            signal,
            tuning,
        );
    }

    return {
        getFileUploader,
        getFileRevisionUploader,
    };
}
