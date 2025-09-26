import { Logger } from "../../interface";
import { NodeAPIService } from "../nodes/apiService";
import { NodesCache } from "../nodes/cache";
import { NodesCryptoCache } from "../nodes/cryptoCache";
import { NodesCryptoService } from "../nodes/cryptoService";
import { NodesAccess } from "../nodes/nodesAccess";
import { isProtonDocument, isProtonSheet } from "../nodes/mediaTypes";
import { splitNodeUid } from "../uids";
import { SharingPublicSharesManager } from "./shares";

export class SharingPublicNodesAccess extends NodesAccess {
    constructor(
        logger: Logger,
        apiService: NodeAPIService,
        cache: NodesCache,
        cryptoCache: NodesCryptoCache,
        cryptoService: NodesCryptoService,
        sharesService: SharingPublicSharesManager,
        private url: string,
        private token: string,
    ) {
        super(logger, apiService, cache, cryptoCache, cryptoService, sharesService);
        this.token = token;
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
