import { DriveCrypto, PrivateKey } from '../../crypto';
import { ProtonDriveAccount } from "../../interface";

export class SharingCryptoService {
    constructor(
        private driveCrypto: DriveCrypto,
        private account: ProtonDriveAccount,
    ) {
        this.driveCrypto = driveCrypto;
        this.account = account;
    }

    // TODO: types
    async generateKeys(nodeKey: PrivateKey, addressKey: PrivateKey): Promise<any> {
        return this.driveCrypto.generateKey([nodeKey, addressKey], addressKey);
    };

    // TODO: types
    async decryptShareKeys(share: any, nodeKey: PrivateKey): Promise<any> {
        // TODO: use correct address keys
        const addressPrivateKeys = await this.account.getOwnPrivateKeys(share.addressId);
        const addressPublicKeys = await this.account.getPublicKeys(share.creatorEmail);

        // TODO: use verified
        const { key, sessionKey } = await this.driveCrypto.decryptKey(
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
    async encryptInvitation(email: string): Promise<any> {
        // TODO
        const publicKey = await this.account.getPublicKeys(email);
        return publicKey;
    };
}
