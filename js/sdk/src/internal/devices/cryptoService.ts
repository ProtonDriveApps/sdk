import { DriveCrypto } from '../../crypto';
import { SharesService } from './interface';

/**
 * Provides crypto operations for devices.
 */
export class DevicesCryptoService {
    constructor(
        private driveCrypto: DriveCrypto,
        private sharesService: SharesService,
    ) {
        this.driveCrypto = driveCrypto;
        this.sharesService = sharesService;
    }

    async createDevice(deviceName: string): Promise<{
        address: {
            addressId: string;
            addressKeyId: string;
        };
        shareKey: {
            armoredKey: string;
            armoredPassphrase: string;
            armoredPassphraseSignature: string;
        };
        node: {
            key: {
                armoredKey: string;
                armoredPassphrase: string;
                armoredPassphraseSignature: string;
            };
            encryptedName: string;
            armoredHashKey: string;
        };
    }> {
        const address = await this.sharesService.getMyFilesShareMemberEmailKey();
        const addressKey = address.addressKey;

        const shareKey = await this.driveCrypto.generateKey([addressKey], addressKey);
        const rootNodeKey = await this.driveCrypto.generateKey([shareKey.decrypted.key], addressKey);
        const { armoredNodeName } = await this.driveCrypto.encryptNodeName(
            deviceName,
            undefined,
            shareKey.decrypted.key,
            addressKey,
        );
        const { armoredHashKey } = await this.driveCrypto.generateHashKey(rootNodeKey.decrypted.key);

        return {
            address: {
                addressId: address.addressId,
                addressKeyId: address.addressKeyId,
            },
            shareKey: {
                armoredKey: shareKey.encrypted.armoredKey,
                armoredPassphrase: shareKey.encrypted.armoredPassphrase,
                armoredPassphraseSignature: shareKey.encrypted.armoredPassphraseSignature,
            },
            node: {
                key: {
                    armoredKey: rootNodeKey.encrypted.armoredKey,
                    armoredPassphrase: rootNodeKey.encrypted.armoredPassphrase,
                    armoredPassphraseSignature: rootNodeKey.encrypted.armoredPassphraseSignature,
                },
                encryptedName: armoredNodeName,
                armoredHashKey,
            },
        };
    }
}
