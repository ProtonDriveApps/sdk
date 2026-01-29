import { uint8ArrayToUtf8, arrayToHexString, DriveCrypto } from './driveCrypto';

describe('uint8ArrayToUtf8', () => {
    it('should convert a Uint8Array to a UTF-8 string', () => {
        const input = new Uint8Array([72, 101, 108, 108, 111]);
        const expectedOutput = 'Hello';
        const result = uint8ArrayToUtf8(input);
        expect(result).toBe(expectedOutput);
    });

    it('should handle an empty Uint8Array', () => {
        const input = new Uint8Array([]);
        const expectedOutput = '';
        const result = uint8ArrayToUtf8(input);
        expect(result).toBe(expectedOutput);
    });

    it('should throw if input is invalid', () => {
        const input = new Uint8Array([887987979887897989]);
        expect(() => uint8ArrayToUtf8(input)).toThrow('The encoded data was not valid for encoding utf-8');
    });
});

describe('arrayToHexString', () => {
    it('should convert a Uint8Array to a hex string', () => {
        const input = new Uint8Array([0, 255, 16, 32]);
        const expectedOutput = '00ff1020';
        const result = arrayToHexString(input);
        expect(result).toBe(expectedOutput);
    });

    it('should handle an empty Uint8Array', () => {
        const input = new Uint8Array([]);
        const expectedOutput = '';
        const result = arrayToHexString(input);
        expect(result).toBe(expectedOutput);
    });

    it('should handle a Uint8Array with one element', () => {
        const input = new Uint8Array([1]);
        const expectedOutput = '01';
        const result = arrayToHexString(input);
        expect(result).toBe(expectedOutput);
    });
});

describe('DriveCrypto.encryptShareUrlPassword', () => {
    it('should encrypt and sign the password', async () => {
        const mockOpenPGPCrypto = {
            encryptAndSignArmored: jest.fn().mockResolvedValue({
                armoredData: '-----BEGIN PGP MESSAGE-----\nencrypted data\n-----END PGP MESSAGE-----',
            }),
        };

        const mockSrpModule = jest.fn();
        const driveCrypto = new DriveCrypto(mockOpenPGPCrypto as any, mockSrpModule as any);

        const password = 'testPassword123';
        const encryptionKey = 'mockEncryptionKey' as any;
        const signingKey = 'mockSigningKey' as any;

        const result = await driveCrypto.encryptShareUrlPassword(password, encryptionKey, signingKey);

        expect(result).toBe('-----BEGIN PGP MESSAGE-----\nencrypted data\n-----END PGP MESSAGE-----');
        expect(mockOpenPGPCrypto.encryptAndSignArmored).toHaveBeenCalledWith(
            new TextEncoder().encode(password),
            undefined,
            [encryptionKey],
            signingKey,
        );
    });
});
