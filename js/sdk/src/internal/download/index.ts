import { DriveCrypto } from "../../crypto";
import { DriveAPIService } from "../apiService";
import { DownloadAPIService } from "./apiService";
import { DownloadCryptoService } from "./cryptoService";
import { NodesService } from "./interface";
import { FileDownloader } from "./fileDownloader";

export function initDownloadModule(
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    nodesService: NodesService,
) {
    const api = new DownloadAPIService(apiService);
    const cryptoService = new DownloadCryptoService(driveCrypto);

    async function getFileDownloader(nodeUid: string, signal?: AbortSignal) {
        const { key } = await nodesService.getNodeKeys(nodeUid);
        const node = await nodesService.getNode(nodeUid);
        return new FileDownloader(api, cryptoService, key, node, signal);
    }

    return {
        getFileDownloader,
    }
}
