import { DriveCrypto } from "../../crypto";

export class DownloadCryptoService {
    constructor(private driveCrypto: DriveCrypto) {
        this.driveCrypto = driveCrypto;
    }

    async decryptBlock() {
    }
}
