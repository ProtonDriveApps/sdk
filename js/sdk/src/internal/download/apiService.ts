import { DriveAPIService, drivePaths } from "../apiService";
import { splitNodeRevisionUid } from "../uids";

const BLOCKS_PAGE_SIZE = 50;

type GetRevisionResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['get']['responses']['200']['content']['application/json'];

export class DownloadAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async* iterateRevisionBlocks(nodeRevisionUid: string, signal?: AbortSignal): AsyncGenerator<{
        bareUrl: string,
        index: number,
        hash: string,
        token: string,
    }> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);
        
        let fromBlockIndex = 1;
        while (true) {
            const result = await this.apiService.get<GetRevisionResponse>(
                `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}?PageSize=${BLOCKS_PAGE_SIZE}&FromBlockIndex=${fromBlockIndex}`,
                signal,
            );

            if (result.Revision.Blocks.length === 0) {
                break;
            }

            for (const block of result.Revision.Blocks) {
                yield {
                    bareUrl: block.BareURL as string,
                    index: block.Index,
                    hash: block.Hash,
                    token: block.Token as string,
                };
                fromBlockIndex = block.Index + 1;
            }
        }
    }
}
