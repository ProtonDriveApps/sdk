import { PrivateKey } from '../../crypto/index';

import { ProtonDriveAccount } from "../../interface/index.js";
import { DriveCrypto } from "../../crypto/index.js";

export function sharingCryptoService(driveCrypto: DriveCrypto, account: ProtonDriveAccount) {
    // TODO: types
    async function generateKeys(nodeKey: PrivateKey, addressKey: PrivateKey): Promise<any> {
        return driveCrypto.generateKey([nodeKey, addressKey], addressKey);
    };

    // TODO: types
    async function decryptShareKeys(share: any, nodeKey: PrivateKey): Promise<any> {
        // TODO: use correct address keys
        const addressPrivateKeys = await account.getOwnPrivateKeys(share.addressId);
        const addressPublicKeys = await account.getPublicKeys(share.creatorEmail);

        // TODO: use verified
        const { key, sessionKey } = await driveCrypto.decryptKey(
            share.encryptedCrypto.armoredKey,
            share.encryptedCrypto.armoredPassphrase,
            share.encryptedCrypto.armoredPassphraseSignature,
            addressPrivateKeys,
            addressPublicKeys,
        )        
        return {
            key,
            sessionKey,
        }
    }

    // TODO: types
    async function encryptInvitation(email: string): Promise<any> {
        // TODO
        const publicKey = await account.getPublicKeys(email);
        return publicKey;
    };

    return {
        generateKeys,
        decryptShareKeys,
        encryptInvitation,
    }
}
