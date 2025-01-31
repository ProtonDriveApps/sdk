import { DriveAPIService } from "../apiService/index.js";

export function uploadAPIService(apiService: DriveAPIService) {
    async function createDraft(parentNodeUid: string, name: string): Promise<any> {
    }

    return {
        createDraft,
    }
}
