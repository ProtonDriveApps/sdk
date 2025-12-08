import { Logger } from '../../interface';
import { makeNodeUidFromRevisionUid } from '../uids';
import { NodeAPIServiceBase } from './apiService';
import { NodesCryptoService } from './cryptoService';
import { NodesAccess } from './nodesAccess';
import { parseFileExtendedAttributes } from './extendedAttributes';
import { DecryptedRevision } from './interface';

/**
 * Provides access to revisions metadata.
 */
export class NodesRevisons {
    constructor(
        private logger: Logger,
        private apiService: NodeAPIServiceBase,
        private cryptoService: NodesCryptoService,
        private nodesAccess: Pick<NodesAccess, 'getNodeKeys'>,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.nodesAccess = nodesAccess;
    }

    async getRevision(nodeRevisionUid: string): Promise<DecryptedRevision> {
        const nodeUid = makeNodeUidFromRevisionUid(nodeRevisionUid);
        const { key } = await this.nodesAccess.getNodeKeys(nodeUid);

        const encryptedRevision = await this.apiService.getRevision(nodeRevisionUid);
        const revision = await this.cryptoService.decryptRevision(nodeUid, encryptedRevision, key);
        const extendedAttributes = parseFileExtendedAttributes(
            this.logger,
            revision.creationTime,
            revision.extendedAttributes,
        );
        return {
            ...revision,
            ...extendedAttributes,
        };
    }

    async *iterateRevisions(nodeUid: string, signal?: AbortSignal): AsyncGenerator<DecryptedRevision> {
        const { key } = await this.nodesAccess.getNodeKeys(nodeUid);

        const encryptedRevisions = await this.apiService.getRevisions(nodeUid, signal);
        for (const encryptedRevision of encryptedRevisions) {
            const revision = await this.cryptoService.decryptRevision(nodeUid, encryptedRevision, key);
            const extendedAttributes = parseFileExtendedAttributes(
                this.logger,
                revision.creationTime,
                revision.extendedAttributes,
            );
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
