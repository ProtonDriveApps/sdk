import { PrivateKey, SessionKey } from '../../crypto';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';

export class BlockVerifier {
    private verificationCode?: Uint8Array;
    private contentKeyPacketSessionKey?: SessionKey;

    constructor(
        private apiService: UploadAPIService,
        private cryptoService: UploadCryptoService,
        private nodeKey: PrivateKey,
        private draftNodeRevisionUid: string,
    ) {
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.draftNodeRevisionUid = draftNodeRevisionUid;
    }

    async loadVerificationData() {
        const result = await this.apiService.getVerificationData(this.draftNodeRevisionUid);
        this.verificationCode = result.verificationCode;
        this.contentKeyPacketSessionKey = await this.cryptoService.getContentKeyPacketSessionKey(
            this.nodeKey,
            result.base64ContentKeyPacket,
        );
    }

    async verifyBlock(encryptedBlock: Uint8Array): Promise<{
        verificationToken: Uint8Array;
    }> {
        if (!this.verificationCode || !this.contentKeyPacketSessionKey) {
            throw new Error('Verifying block before loading verification data');
        }

        return this.cryptoService.verifyBlock(
            this.contentKeyPacketSessionKey,
            this.verificationCode,
            encryptedBlock,
        );
    }
}
