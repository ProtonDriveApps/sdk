import { PrivateKey, SessionKey } from '../../crypto';
import { UploadAPIService } from './apiService';
import { BlockVerifier, SmallFileBlockVerifier } from './blockVerifier';
import { UploadCryptoService } from './cryptoService';

describe('BlockVerifier', () => {
    let apiService: jest.Mocked<UploadAPIService>;
    let cryptoService: jest.Mocked<UploadCryptoService>;
    let nodeKey: PrivateKey;
    let sessionKey: SessionKey;

    const draftNodeRevisionUid = 'volumeId~nodeId~revisionId';
    const verificationCode = new Uint8Array(32).fill(1);
    const base64ContentKeyPacket = 'base64ContentKeyPacket';
    const mockVerificationToken = new Uint8Array(16).fill(9);

    beforeEach(() => {
        nodeKey = {} as PrivateKey;
        sessionKey = {} as SessionKey;

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            getVerificationData: jest.fn().mockResolvedValue({
                verificationCode,
                base64ContentKeyPacket,
            }),
        };

        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            getContentKeyPacketSessionKey: jest.fn().mockResolvedValue(sessionKey),
            verifyBlock: jest.fn().mockResolvedValue({ verificationToken: mockVerificationToken }),
        };
    });

    it('should throw when verifying block before loading verification data', async () => {
        const blockVerifier = new BlockVerifier(apiService, cryptoService, nodeKey, draftNodeRevisionUid);

        await expect(blockVerifier.verifyBlock(new Uint8Array([1, 2, 3]))).rejects.toThrow(
            'Verifying block before loading verification data',
        );

        expect(cryptoService.verifyBlock).not.toHaveBeenCalled();
    });

    it('should load verification data from API and crypto service', async () => {
        const blockVerifier = new BlockVerifier(apiService, cryptoService, nodeKey, draftNodeRevisionUid);

        await blockVerifier.loadVerificationData();

        expect(apiService.getVerificationData).toHaveBeenCalledWith(draftNodeRevisionUid);
        expect(cryptoService.getContentKeyPacketSessionKey).toHaveBeenCalledWith(nodeKey, base64ContentKeyPacket);
    });

    it('should verify block using loaded verification data', async () => {
        const blockVerifier = new BlockVerifier(apiService, cryptoService, nodeKey, draftNodeRevisionUid);
        const encryptedBlock = new Uint8Array([4, 5, 6]);

        await blockVerifier.loadVerificationData();
        const result = await blockVerifier.verifyBlock(encryptedBlock);

        expect(cryptoService.verifyBlock).toHaveBeenCalledWith(sessionKey, verificationCode, encryptedBlock);
        expect(result).toEqual({ verificationToken: mockVerificationToken });
    });
});

describe('SmallFileBlockVerifier', () => {
    let apiService: jest.Mocked<UploadAPIService>;
    let cryptoService: jest.Mocked<UploadCryptoService>;
    let nodeKey: PrivateKey;
    let sessionKey: SessionKey;

    const nodeUid = 'volumeId~nodeId';
    const mockVerificationToken = new Uint8Array(16).fill(7);

    beforeEach(() => {
        nodeKey = {} as PrivateKey;
        sessionKey = {} as SessionKey;

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            getVerificationDataForExistingSmallFile: jest.fn(),
        };

        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            getContentKeyPacketSessionKey: jest.fn().mockResolvedValue(sessionKey),
            verifyBlock: jest.fn().mockResolvedValue({ verificationToken: mockVerificationToken }),
        };
    });

    it('should throw when verifying block before loading verification data', async () => {
        const blockVerifier = new SmallFileBlockVerifier(apiService, cryptoService);

        await expect(blockVerifier.verifyBlock(new Uint8Array([1, 2, 3]))).rejects.toThrow(
            'Verifying block before loading verification data',
        );

        expect(cryptoService.verifyBlock).not.toHaveBeenCalled();
    });

    it('should load verification data for new small file from content key packet', async () => {
        const contentKeyPacket = new Uint8Array(64);
        contentKeyPacket.fill(3, 0, 32);
        contentKeyPacket.fill(8, 32);
        const expectedVerificationCode = contentKeyPacket.subarray(-32);

        const blockVerifier = new SmallFileBlockVerifier(apiService, cryptoService);

        await blockVerifier.loadVerificationDataForNewSmallFile(nodeKey, contentKeyPacket);

        expect(cryptoService.getContentKeyPacketSessionKey).toHaveBeenCalledWith(
            nodeKey,
            contentKeyPacket.toBase64(),
        );

        const encryptedBlock = new Uint8Array([1, 2, 3]);
        await blockVerifier.verifyBlock(encryptedBlock);

        expect(cryptoService.verifyBlock).toHaveBeenCalledWith(sessionKey, expectedVerificationCode, encryptedBlock);
    });

    it('should load verification data for existing small file from API', async () => {
        const contentKeyPacket = new Uint8Array(64);
        contentKeyPacket.fill(5, 0, 32);
        contentKeyPacket.fill(6, 32);
        const base64ContentKeyPacket = contentKeyPacket.toBase64();
        const expectedVerificationCode = contentKeyPacket.subarray(-32);

        apiService.getVerificationDataForExistingSmallFile.mockResolvedValue({ base64ContentKeyPacket });

        const blockVerifier = new SmallFileBlockVerifier(apiService, cryptoService);

        await blockVerifier.loadVerificationDataForExistingSmallFile(nodeUid, nodeKey);

        expect(apiService.getVerificationDataForExistingSmallFile).toHaveBeenCalledWith(nodeUid);
        expect(cryptoService.getContentKeyPacketSessionKey).toHaveBeenCalledWith(nodeKey, base64ContentKeyPacket);

        const encryptedBlock = new Uint8Array([9, 8, 7]);
        await blockVerifier.verifyBlock(encryptedBlock);

        expect(cryptoService.verifyBlock).toHaveBeenCalledWith(sessionKey, expectedVerificationCode, encryptedBlock);
    });
});
