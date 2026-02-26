import { PrivateKey } from '../../crypto';
import { MetricVolumeType, PhotoAttributes, AlbumAttributes, PhotoTag } from '../../interface';
import { DecryptedNode, EncryptedNode, DecryptedUnparsedNode } from '../nodes/interface';
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

export type EncryptedPhotoNode = EncryptedNode & {
    photo?: EncryptedPhotoAttributes;
    album?: AlbumAttributes;
};

export type DecryptedUnparsedPhotoNode = DecryptedUnparsedNode & {
    photo?: PhotoAttributes;
    album?: AlbumAttributes;
};

export type DecryptedPhotoNode = DecryptedNode & {
    photo?: PhotoAttributes;
    album?: AlbumAttributes;
};

export type EncryptedPhotoAttributes = Omit<PhotoAttributes, 'albums'> & {
    contentHash?: string;
    albums: (PhotoAttributes['albums'][0] & {
        nameHash?: string;
        contentHash?: string;
    })[];
};

export type TimelineItem = {
    nodeUid: string;
    captureTime: Date;
    tags: PhotoTag[];
};

export type AlbumItem = {
    nodeUid: string;
    captureTime: Date;
};
