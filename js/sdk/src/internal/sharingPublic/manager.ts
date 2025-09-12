import { PrivateKey } from '../../crypto';
import { Logger } from '../../interface';
import { parseNode } from '../nodes/nodesAccess';
import { SharingPublicAPIService } from './apiService';
import { SharingPublicCryptoCache } from './cryptoCache';
import { SharingPublicCryptoService } from './cryptoService';
import { EncryptedShareCrypto, EncryptedNode, DecryptedNode, DecryptedNodeKeys } from './interface';

// TODO: comment
export class SharingPublicManager {
    constructor(
        private logger: Logger,
        private api: SharingPublicAPIService,
        private cryptoCache: SharingPublicCryptoCache,
        private cryptoService: SharingPublicCryptoService,
        private token: string,
    ) {
        this.logger = logger;
        this.api = api;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.token = token;
    }

    async getRootNode(): Promise<DecryptedNode> {
        const { encryptedNode, encryptedShare } = await this.api.getPublicLinkRoot(this.token);
        await this.decryptShare(encryptedShare);
        return this.decryptNode(encryptedNode);
    }

    async *iterateFolderChildren(parentUid: string, signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        // TODO: optimise this - decrypt in parallel
        for await (const node of this.api.iterateFolderChildren(parentUid, signal)) {
            const decryptedNode = await this.decryptNode(node);
            yield decryptedNode;
        }
    }

    private async decryptShare(encryptedShare: EncryptedShareCrypto): Promise<void> {
        const shareKey = await this.cryptoService.decryptPublicLinkShareKey(encryptedShare);
        await this.cryptoCache.setShareKey(shareKey);
    }

    private async decryptNode(encryptedNode: EncryptedNode): Promise<DecryptedNode> {
        const parentKey = await this.getParentKey(encryptedNode);

        const { node: unparsedNode, keys } = await this.cryptoService.decryptNode(encryptedNode, parentKey);
        const node = await parseNode(this.logger, unparsedNode);

        // TODO: cache of metadata?
        if (keys) {
            try {
                await this.cryptoCache.setNodeKeys(node.uid, keys);
            } catch (error: unknown) {
                this.logger.error(`Failed to cache node keys ${node.uid}`, error);
            }
        }

        return node;
    }

    private async getParentKey(node: Pick<DecryptedNode, 'parentUid'>): Promise<PrivateKey> {
        if (node.parentUid) {
            // TODO: try-catch
            const keys = await this.getNodeKeys(node.parentUid);
            return keys.key;
        }

        try {
            return await this.cryptoCache.getShareKey();
        } catch {
            await this.getRootNode();
            return this.cryptoCache.getShareKey();
        }
    }

    async getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        try {
            const keys = await this.cryptoCache.getNodeKeys(nodeUid);
            return keys;
        } catch {
            // TODO: handle this
            throw new Error('Node key not found in cache');
        }
    }
}
