import { DriveCrypto } from "../../crypto";
import { ProtonDriveAccount, ProtonDriveTelemetry } from "../../interface";
import { DriveAPIService } from "../apiService";
import { DownloadAPIService } from "./apiService";
import { DownloadCryptoService } from "./cryptoService";
import { NodesService } from "./interface";
import { FileDownloader } from "./fileDownloader";
import { DownloadQueue } from "./queue";
import { DownloadTelemetry } from "./telemetry";

export function initDownloadModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    account: ProtonDriveAccount,
    nodesService: NodesService,
) {
    const queue = new DownloadQueue();
    const api = new DownloadAPIService(apiService);
    const cryptoService = new DownloadCryptoService(driveCrypto, account);
    const downloadTelemetry = new DownloadTelemetry(telemetry);

    async function getFileDownloader(nodeUid: string, signal?: AbortSignal) {
        await queue.waitForCapacity(signal);

        let node, nodeKey;
        try {
            node = await nodesService.getNode(nodeUid);
            nodeKey = await nodesService.getNodeKeys(nodeUid);
        } catch (error: unknown) {
            queue.releaseCapacity();
            downloadTelemetry.downloadInitFailed(error);
            throw error;
        }

        const onFinish = () => queue.releaseCapacity();

        return new FileDownloader(
            downloadTelemetry,
            api,
            cryptoService,
            nodeKey,
            node,
            signal,
            onFinish,
        );
    }

    return {
        getFileDownloader,
    }
}
