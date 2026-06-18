import { PrivateKey, SessionKey } from '../../crypto';
import { UploadAPIService } from './apiService';
import { UploadCryptoService } from './cryptoService';

abstract class BlockVerifierBase {
    protected verificationCode?: Uint8Array<ArrayBuffer>;
    protected contentKeyPacketSessionKey?: SessionKey;

    constructor(
        protected apiService: UploadAPIService,
        protected cryptoService: UploadCryptoService,
    ) {}

    async verifyBlock(encryptedBlock: Uint8Array<ArrayBuffer>): Promise<{
        verificationToken: Uint8Array<ArrayBuffer>;
    }> {
        if (!this.verificationCode || !this.contentKeyPacketSessionKey) {
            throw new Error('Verifying block before loading verification data');
        }

        return this.cryptoService.verifyBlock(this.contentKeyPacketSessionKey, this.verificationCode, encryptedBlock);
    }
}

export class BlockVerifier extends BlockVerifierBase {
    constructor(
        apiService: UploadAPIService,
        cryptoService: UploadCryptoService,
        private nodeKey: PrivateKey,
        private draftNodeRevisionUid: string,
    ) {
        super(apiService, cryptoService);
    }

    async loadVerificationData() {
        const result = await this.apiService.getVerificationData(this.draftNodeRevisionUid);
        this.verificationCode = result.verificationCode;
        this.contentKeyPacketSessionKey = await this.cryptoService.getContentKeyPacketSessionKey(
            this.nodeKey,
            result.base64ContentKeyPacket,
        );
    }
}

export class SmallFileBlockVerifier extends BlockVerifierBase {
    async loadVerificationDataForNewSmallFile(nodeKey: PrivateKey, contentKeyPacket: Uint8Array<ArrayBuffer>) {
        this.verificationCode = this.getVerificationCode(contentKeyPacket);
        this.contentKeyPacketSessionKey = await this.cryptoService.getContentKeyPacketSessionKey(
            nodeKey,
            contentKeyPacket.toBase64(),
        );
    }

    async loadVerificationDataForExistingSmallFile(nodeUid: string, nodeKey: PrivateKey) {
        const result = await this.apiService.getVerificationDataForExistingSmallFile(nodeUid);
        this.verificationCode = this.getVerificationCode(Uint8Array.fromBase64(result.base64ContentKeyPacket));
        this.contentKeyPacketSessionKey = await this.cryptoService.getContentKeyPacketSessionKey(
            nodeKey,
            result.base64ContentKeyPacket,
        );
    }

    private getVerificationCode(contentKeyPacket: Uint8Array<ArrayBuffer>) {
        return contentKeyPacket.subarray(-32);
    }
}
