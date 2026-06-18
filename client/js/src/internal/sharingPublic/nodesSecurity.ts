import { SharingPublicAPIService } from './apiService';

type ScannedHash = string;
export type NodesSecurityScanResult = Record<ScannedHash, { safe?: boolean; error?: string }>;

export class NodesSecurity {
    constructor(
        private apiService: SharingPublicAPIService,
        private token: string,
    ) {
        this.apiService = apiService;
        this.token = token;
    }

    async scanHashes(hashes: string[]): Promise<NodesSecurityScanResult> {
        const response = await this.apiService.malwareScan(this.token, hashes);
        const result: NodesSecurityScanResult = {};

        response.Results.forEach(({ Hash, Safe }) => {
            result[Hash] = {
                ...(result[Hash] || {}),
                safe: Safe,
            };
        });

        response.Errors.forEach(({ Hash, Error }) => {
            result[Hash] = {
                ...(result[Hash] || {}),
                error: Error,
            };
        });

        return result;
    }
}
