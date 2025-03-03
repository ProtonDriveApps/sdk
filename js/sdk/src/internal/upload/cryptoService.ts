import { DriveCrypto, PrivateKey } from "../../crypto";

export class UploadCryptoService {
    constructor(private driveCrypto: DriveCrypto) {
        this.driveCrypto = driveCrypto;
    }

    async generateKey(parentKey: PrivateKey) {
        return this.driveCrypto.generateKey(parentKey, parentKey);
    };

    private async generateHash() {
    };
}
