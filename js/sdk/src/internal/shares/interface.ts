import { PrivateKey, SessionKey } from "../../crypto/index.js";

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
interface VolumeShareNodeIDs {
    volumeId: string;
    shareId: string;
    rootNodeId: string;
}

export type Volume = {
    /**
     * Creator email comes from the default share.
     * 
     * The idea is to keep this information synced, so whenever we check
     * cached volume information, we have creator email at hand for any
     * verification checks.
     */
    creatorEmail: string;
} & VolumeShareNodeIDs;

/**
 * Internal share interface.
 */
type BaseShare = {
    creatorEmail: string;
    /**
     * Address ID is set only when user is member of the share.
     * Owner or invitee of share with higher access in the tree
     * might not have this field set.
     */
    addressId?: string;
} & VolumeShareNodeIDs;

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
    encryptedCrypto: EncryptedShareCrypto;
}

/**
 * Interface used only internaly in the shares module.
 * 
 * Outside of the module, the decrypted share interface should be used.
 */
export interface EncryptedRootShare extends BaseRootShare {
    encryptedCrypto: EncryptedShareCrypto;
}

/**
 * Interface holding decrypted share metadata.
 */
export interface DecryptedRootShare extends BaseRootShare {
    decryptedCrypto: DecryptedShareCrypto;
}

export interface EncryptedShareCrypto {
    armoredKey: string;
    armoredPassphrase: string;
    armoredPassphraseSignature: string;
}

export interface DecryptedShareCrypto {
    key: PrivateKey;
    sessionKey: SessionKey;
}
