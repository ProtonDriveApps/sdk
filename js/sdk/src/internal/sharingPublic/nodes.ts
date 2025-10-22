import { ProtonDriveTelemetry } from '../../interface';
import { NodeAPIService } from '../nodes/apiService';
import { NodesCache } from '../nodes/cache';
import { NodesCryptoCache } from '../nodes/cryptoCache';
import { NodesCryptoService } from '../nodes/cryptoService';
import { NodesAccess } from '../nodes/nodesAccess';
import { isProtonDocument, isProtonSheet } from '../nodes/mediaTypes';
import { splitNodeUid } from '../uids';
import { SharingPublicSharesManager } from './shares';
import { DecryptedNode, DecryptedNodeKeys } from '../nodes/interface';
import { PrivateKey } from '../../crypto';

export class SharingPublicNodesAccess extends NodesAccess {
    constructor(
        telemetry: ProtonDriveTelemetry,
        apiService: NodeAPIService,
        cache: NodesCache,
        cryptoCache: NodesCryptoCache,
        cryptoService: NodesCryptoService,
        sharesService: SharingPublicSharesManager,
        private url: string,
        private token: string,
        private publicShareKey: PrivateKey,
        private publicRootNodeUid: string,
    ) {
        super(telemetry, apiService, cache, cryptoCache, cryptoService, sharesService);
        this.token = token;
        this.publicShareKey = publicShareKey;
        this.publicRootNodeUid = publicRootNodeUid;
    }

    async getParentKeys(
        node: Pick<DecryptedNode, 'uid' | 'parentUid' | 'shareId'>,
    ): Promise<Pick<DecryptedNodeKeys, 'key' | 'hashKey'>> {
        // If we reached the root node of the public link, return the public
        // share key even if user has access to the parent node. We do not
        // support access to nodes outside of the public link context.
        // For other nodes, the client must use the main SDK.
        if (node.uid === this.publicRootNodeUid) {
            return {
                key: this.publicShareKey,
            };
        }

        return super.getParentKeys(node);
    }

    async getNodeUrl(nodeUid: string): Promise<string> {
        const node = await this.getNode(nodeUid);
        if (isProtonDocument(node.mediaType) || isProtonSheet(node.mediaType)) {
            const { nodeId } = splitNodeUid(nodeUid);
            const type = isProtonDocument(node.mediaType) ? 'doc' : 'sheet';
            return `https://docs.proton.me/doc?type=${type}&mode=open-url&token=${this.token}&linkId=${nodeId}`;
        }

        // Public link doesn't support specific node URLs.
        return this.url;
    }
}
