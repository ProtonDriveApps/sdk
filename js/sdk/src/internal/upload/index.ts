import { DriveAPIService } from "../apiService/index.js";
import { DriveCrypto } from "../../crypto/index.js";
import { uploadAPIService } from "./apiService.js";
import { uploadCryptoService } from "./cryptoService.js";
import { UploadQueue } from "./queue.js";
import { NodesService } from "./interface.js";
import { Fileuploader } from "./fileUploader.js";

type UploadMetadata = {
    mimeType: string,
    expectedSize: number,
    additionalMetadata?: object,
}

export function upload(
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    nodesService: NodesService,
) {
    const api = uploadAPIService(apiService);
    const cryptoService = uploadCryptoService(driveCrypto);

    const queue = new UploadQueue();

    async function getFileUploader(
        parentFolderUid: string,
        name: string,
        metadata: UploadMetadata,
        signal?: AbortSignal
    ) {
        await queue.waitForCapacity(metadata.expectedSize, signal);
        const parentKey = nodesService.getNodeKeys(parentFolderUid);
        const nodeKeys = cryptoService.generateKeys(parentKey);
        // TODO: encrypt name etc.
        const draft = api.createDraft(parentFolderUid, name);
        return new Fileuploader(queue, nodeKeys, draft);
    }

    return {
        getFileUploader,
    }
}


