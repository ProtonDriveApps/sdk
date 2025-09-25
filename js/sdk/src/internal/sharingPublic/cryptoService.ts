import { DriveCrypto, PrivateKey } from '../../crypto';
import { EncryptedShareCrypto } from './interface';

export class SharingPublicCryptoService {
    constructor(
        private driveCrypto: DriveCrypto,
        private password: string,
    ) {
        this.driveCrypto = driveCrypto;
        this.password = password;
    }

    async decryptPublicLinkShareKey(encryptedShare: EncryptedShareCrypto): Promise<PrivateKey> {
        const { key: shareKey } = await this.driveCrypto.decryptKeyWithSrpPassword(
            this.password,
            encryptedShare.base64UrlPasswordSalt,
            encryptedShare.armoredKey,
            encryptedShare.armoredPassphrase,
        );
        return shareKey;
    }
}
