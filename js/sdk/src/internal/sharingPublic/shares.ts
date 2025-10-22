import { PrivateKey } from '../../crypto';
import { MetricVolumeType, ProtonDriveAccount } from '../../interface';
import { splitNodeUid } from '../uids';

/**
 * Provides high-level actions for managing public link share.
 *
 * The public link share manager provides the same interface as the code share
 * service so it can be used in the same way in various modules that use shares.
 */
export class SharingPublicSharesManager {
    constructor(
        private account: ProtonDriveAccount,
        private publicShareKey: PrivateKey,
        private publicRootNodeUid: string,
    ) {
        this.account = account;
        this.publicShareKey = publicShareKey;
        this.publicRootNodeUid = publicRootNodeUid;
    }

    // TODO: Rename to getRootIDs everywhere.
    async getOwnVolumeIDs(): Promise<{ volumeId: string; rootNodeId: string; rootNodeUid: string }> {
        const { volumeId, nodeId: rootNodeId } = splitNodeUid(this.publicRootNodeUid);
        return { volumeId, rootNodeId, rootNodeUid: this.publicRootNodeUid };
    }

    async getSharePrivateKey(): Promise<PrivateKey> {
        return this.publicShareKey;
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
