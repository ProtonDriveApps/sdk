import { ProtonDriveTelemetry, UploadMetadata } from "../../interface";
import { DriveAPIService } from "../apiService";
import { DriveCrypto } from "../../crypto";
import { UploadAPIService } from "./apiService";
import { UploadCryptoService } from "./cryptoService";
import { UploadQueue } from "./queue";
import { NodesService, SharesService } from "./interface";
import { Fileuploader } from "./fileUploader";
import { UploadTelemetry } from "./telemetry";
import { UploadManager } from "./manager";
import { BlockVerifier } from "./blockVerifier";

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
) {
    const api = new UploadAPIService(apiService);
    const cryptoService = new UploadCryptoService(driveCrypto, sharesService);
    const uploadTelemetry = new UploadTelemetry(telemetry);
    const manager = new UploadManager(telemetry, api, cryptoService, nodesService);

    const queue = new UploadQueue();

    async function getFileUploader(
        parentFolderUid: string,
        name: string,
        metadata: UploadMetadata,
        signal?: AbortSignal,
    ) {
        await queue.waitForCapacity(signal);

        let revisionDraft, blockVerifier;
        try {
            revisionDraft = await manager.createDraftNode(parentFolderUid, name, metadata);

            blockVerifier = new BlockVerifier(api, cryptoService, revisionDraft.nodeKeys.key, revisionDraft.nodeRevisionUid);
            await blockVerifier.loadVerificationData();
        } catch (error: unknown) {
            queue.releaseCapacity();
            if (revisionDraft) {
                await manager.deleteDraftNode(revisionDraft.nodeUid);
            }
            uploadTelemetry.uploadInitFailed(error, metadata.expectedSize);
            throw error;
        }

        const onFinish = async (failure: boolean) => {
            queue.releaseCapacity();
            if (failure) {
                await manager.deleteDraftNode(revisionDraft.nodeUid);
            }
        }

        return new Fileuploader(
            uploadTelemetry,
            api,
            cryptoService,
            blockVerifier,
            revisionDraft,
            metadata,
            onFinish,
            signal,
        );
    }

    return {
        getFileUploader,
    }
}
