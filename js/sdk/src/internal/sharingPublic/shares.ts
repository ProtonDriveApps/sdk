import { PrivateKey } from '../../crypto';
import { MetricVolumeType, ProtonDriveAccount } from '../../interface';
import { splitNodeUid } from '../uids';
import { SharingPublicAPIService } from './apiService';
import { SharingPublicCryptoCache } from './cryptoCache';
import { SharingPublicCryptoService } from './cryptoService';

/**
 * Provides high-level actions for managing public link share.
 *
 * The public link share manager provides the same interface as the code share
 * service so it can be used in the same way in various modules that use shares.
 */
export class SharingPublicSharesManager {
    private promisePublicLinkRoot?: Promise<{
        rootIds: { volumeId: string; rootNodeId: string; rootNodeUid: string };
        shareKey: PrivateKey;
    }>;

    constructor(
        private apiService: SharingPublicAPIService,
        private cryptoCache: SharingPublicCryptoCache,
        private cryptoService: SharingPublicCryptoService,
        private account: ProtonDriveAccount,
        private token: string,
    ) {
        this.apiService = apiService;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.account = account;
        this.token = token;
    }

    // TODO: Rename to getRootIDs everywhere.
    async getOwnVolumeIDs(): Promise<{ volumeId: string; rootNodeId: string; rootNodeUid: string }> {
        const { rootIds } = await this.getPublicLinkRoot();
        return rootIds;
    }

    async getSharePrivateKey(): Promise<PrivateKey> {
        const { shareKey } = await this.getPublicLinkRoot();
        return shareKey;
    }

    private async getPublicLinkRoot(): Promise<{
        rootIds: { volumeId: string; rootNodeId: string; rootNodeUid: string };
        shareKey: PrivateKey;
    }> {
        if (!this.promisePublicLinkRoot) {
            this.promisePublicLinkRoot = (async () => {
                const { encryptedNode, encryptedShare } = await this.apiService.getPublicLinkRoot(this.token);

                const { volumeId, nodeId: rootNodeId } = splitNodeUid(encryptedNode.uid);

                const shareKey = await this.cryptoService.decryptPublicLinkShareKey(encryptedShare);
                await this.cryptoCache.setShareKey(shareKey);

                return {
                    rootIds: { volumeId, rootNodeId, rootNodeUid: encryptedNode.uid },
                    shareKey,
                };
            })();
        }

        return this.promisePublicLinkRoot;
    }

    async getContextShareMemberEmailKey(): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }> {
        const address = await this.account.getOwnPrimaryAddress();
        return {
            email: address.email,
            addressId: address.addressId,
            addressKey: address.keys[address.primaryKeyIndex].key,
            addressKeyId: address.keys[address.primaryKeyIndex].id,
        };
    }

    async getVolumeMetricContext(): Promise<MetricVolumeType> {
        return MetricVolumeType.SharedPublic;
    }
}
