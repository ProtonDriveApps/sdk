import { Logger, Revision } from "../../interface";
import { NodeAPIService } from "./apiService";
import { NodesCryptoService } from "./cryptoService";
import { NodesAccess } from "./nodesAccess";
import { parseFileExtendedAttributes } from "./extendedAttributes";

/**
 * Provides access to revisions metadata.
 */
export class NodesRevisons {
    constructor(
        private apiService: NodeAPIService,
        private cryptoService: NodesCryptoService,
        private nodesAccess: NodesAccess,
        private log?: Logger,
    ) {
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.nodesAccess = nodesAccess;
        this.log = log;
    }

    async* iterateRevisions(nodeUid: string, signal?: AbortSignal): AsyncGenerator<Revision> {
        const node = await this.nodesAccess.getNode(nodeUid);
        const { key: parentKey } = await this.nodesAccess.getParentKeys(node);
        const { key } = await this.nodesAccess.getNodeKeys(nodeUid);

        const encryptedRevisions = await this.apiService.getRevisions(nodeUid, signal);
        for (const encryptedRevision of encryptedRevisions) {
            const revision = await this.cryptoService.decryptRevision(encryptedRevision, key, parentKey);
            const extendedAttributes = parseFileExtendedAttributes(revision.extendedAttributes, this.log);
            yield {
                ...revision,
                ...extendedAttributes,
            };
        }
    }

    async restoreRevision(nodeRevisionUid: string): Promise<void> {
        await this.apiService.restoreRevision(nodeRevisionUid);
    }

    async deleteRevision(nodeRevisionUid: string): Promise<void> {
        await this.apiService.deleteRevision(nodeRevisionUid);
    }
}
