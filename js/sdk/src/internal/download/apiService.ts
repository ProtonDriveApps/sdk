import { DriveAPIService, drivePaths, ObserverStream } from "../apiService";
import { splitNodeRevisionUid } from "../uids";
import { BlockMetadata } from "./interface";

const BLOCKS_PAGE_SIZE = 20;

type GetRevisionResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['get']['responses']['200']['content']['application/json'];

export class DownloadAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async* iterateRevisionBlocks(nodeRevisionUid: string, signal?: AbortSignal, fromBlockIndex = 1): AsyncGenerator<
        { type: 'manifestSignature', armoredManifestSignature?: string } |
        { type: 'thumbnail', base64sha256Hash: string } |
        { type: 'block' } & BlockMetadata
    > {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        while (true) {
            if (signal?.aborted) {
                break;
            }

            const result = await this.apiService.get<GetRevisionResponse>(
                `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}?PageSize=${BLOCKS_PAGE_SIZE}&FromBlockIndex=${fromBlockIndex}`,
                signal,
            );

            if (fromBlockIndex === 1) {
                yield {
                    type: 'manifestSignature',
                    armoredManifestSignature: result.Revision.ManifestSignature || undefined,
                };

                if (result.Revision.Thumbnails.length > 0) {
                    for (const block of result.Revision.Thumbnails) {
                        yield {
                            type: 'thumbnail',
                            base64sha256Hash: block.Hash,
                        }
                    }
                }
            }

            if (result.Revision.Blocks.length === 0) {
                break;
            }

            for (const block of result.Revision.Blocks) {
                yield {
                    type: 'block',
                    ...transformBlock(block),
                };
                fromBlockIndex = block.Index + 1;
            }
        }
    }

    async getRevisionBlockToken(nodeRevisionUid: string, blockIndex: number, signal?: AbortSignal): Promise<BlockMetadata> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        const result = await this.apiService.get<GetRevisionResponse>(
            `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}?PageSize=1&FromBlockIndex=${blockIndex}`,
            signal,
        );

        const block = result.Revision.Blocks[0];
        return transformBlock(block);
    }

    async downloadBlock(baseUrl: string, token: string, onProgress?: (downloadedBytes: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
        const rawBlockStream = await this.apiService.getBlockStream(baseUrl, token, signal);
        const progressStream = new ObserverStream((value) => {
            onProgress?.(value.length);
        });
        const blockStream = rawBlockStream.pipeThrough(progressStream);
        const encryptedBlock = new Uint8Array(await new Response(blockStream).arrayBuffer());
        return encryptedBlock;
    }
}

function transformBlock(block: GetRevisionResponse['Revision']['Blocks'][0]): BlockMetadata {
    return {
        index: block.Index,
        bareUrl: block.BareURL as string,
        token: block.Token as string,
        base64sha256Hash: block.Hash,
        signatureEmail: block.SignatureEmail || undefined,
        armoredSignature: block.EncSignature || undefined,
    };
}
