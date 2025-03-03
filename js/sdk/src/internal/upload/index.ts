import { DriveAPIService } from "../apiService";
import { DriveCrypto } from "../../crypto";
import { UploadAPIService } from "./apiService";
import { UploadCryptoService } from "./cryptoService";
import { UploadQueue } from "./queue";
import { NodesService } from "./interface";
import { Fileuploader } from "./fileUploader";

type UploadMetadata = {
    mimeType: string,
    expectedSize: number,
    additionalMetadata?: object,
}

export function initUploadModule(
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    nodesService: NodesService,
) {
    const api = new UploadAPIService(apiService);
    const cryptoService = new UploadCryptoService(driveCrypto);

    const queue = new UploadQueue();

    async function getFileUploader(
        parentFolderUid: string,
        name: string,
        metadata: UploadMetadata,
        signal?: AbortSignal
    ) {
        await queue.waitForCapacity(metadata.expectedSize, signal);
        const parentKey = await nodesService.getNodeKeys(parentFolderUid);
        const nodeKey = await cryptoService.generateKey(parentKey);
        // TODO: encrypt name etc.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nodeData: any = {
            name,
        }
        const { nodeRevisionUid } = await api.createDraft(parentFolderUid, nodeData);
        return new Fileuploader(nodeKey, nodeRevisionUid);
    }

    return {
        getFileUploader,
    }
}
