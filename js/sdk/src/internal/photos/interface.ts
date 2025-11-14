import { PrivateKey } from '../../crypto';
import { MissingNode, MetricVolumeType } from '../../interface';
import { DecryptedNode } from '../nodes';
import { EncryptedShare } from '../shares';

export interface SharesService {
    getRootIDs(): Promise<{ volumeId: string; rootNodeId: string }>;
    loadEncryptedShare(shareId: string): Promise<EncryptedShare>;
    getSharePrivateKey(shareId: string): Promise<PrivateKey>;
    getMyFilesShareMemberEmailKey(): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }>;
    getContextShareMemberEmailKey(shareId: string): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }>;
    isOwnVolume(volumeId: string): Promise<boolean>;
    getVolumeMetricContext(volumeId: string): Promise<MetricVolumeType>;
}

export interface NodesService {
    getNode(nodeUid: string): Promise<DecryptedNode>;
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode | MissingNode>;
    getNodeKeys(nodeUid: string): Promise<{
        hashKey?: Uint8Array;
    }>;
}
