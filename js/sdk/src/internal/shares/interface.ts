import { PrivateKey, SessionKey } from "../../crypto";
import { Result, UnverifiedAuthorError } from "../../interface";

/**
 * Internal interface providing basic identification of volume and its root
 * share and node.
 * 
 * No interface should inherit from this, this is only for composition to
 * create basic volume or share interfaces.
 * 
 * Volumes do not have necessarily share or node, but we want to always
 * know what is the root share or node, thus we want to keep this for both
 * volumes or any type of share.
 */
export interface VolumeShareNodeIDs {
    volumeId: string;
    shareId: string;
    rootNodeId: string;
}

export type Volume = {
    /**
     * Creator email and address ID come from the default share.
     * 
     * The idea is to keep this information synced, so whenever we check
     * cached volume information, we have creator details at hand for any
     * verification checks or creation needs.
     */
    creatorEmail: string;
    addressId: string;
} & VolumeShareNodeIDs;

/**
 * Internal share interface.
 */
type BaseShare = {
    /**
     * Address ID is set only when user is member of the share.
     * Owner or invitee of share with higher access in the tree
     * might not have this field set.
     */
    addressId?: string;
    creationTime?: Date;
    type: ShareType;
} & VolumeShareNodeIDs;

export enum ShareType {
    Main = 'main',
    Standard = 'standard',
    Device = 'device',
    Photo = 'photo',
}

interface BaseRootShare extends BaseShare {
    /**
     * Address ID is always available for root shares, in contrast
     * to other standard shares that might not have it. See the comment
     * for BaseShare.
     */
    addressId: string;
}

/**
 * Interface used only internaly in the shares module.
 * 
 * Outside of the module, the decrypted share interface should be used.
 */
export interface EncryptedShare extends BaseShare {
    creatorEmail: string;
    encryptedCrypto: EncryptedShareCrypto;
    membership?: ShareMembership;
}

interface ShareMembership {
    memberUid: string;
}

/**
 * Interface used only internaly in the shares module.
 * 
 * Outside of the module, the decrypted share interface should be used.
 */
export interface EncryptedRootShare extends BaseRootShare {
    creatorEmail: string;
    encryptedCrypto: EncryptedShareCrypto;
}

/**
 * Interface holding decrypted share metadata.
 */
export interface DecryptedRootShare extends BaseRootShare {
    author: Result<string, UnverifiedAuthorError>,
}

export interface EncryptedShareCrypto {
    armoredKey: string;
    armoredPassphrase: string;
    armoredPassphraseSignature: string;
}

export interface DecryptedShareKey {
    key: PrivateKey;
    passphraseSessionKey: SessionKey;
}
