import { OpenPGPCrypto, PrivateKey, PublicKey, SessionKey, VERIFICATION_STATUS } from './interface';
import { uint8ArrayToBase64String } from './utils';

/**
 * Interface matching CryptoProxy interface from client's monorepo:
 * clients/packages/crypto/lib/proxy/proxy.ts.
 */
interface OpenPGPCryptoProxy {
    generateKey: (options: { userIDs: { name: string }[], type: string, curve: string }) => Promise<{ privateKey: PrivateKey, publicKey: PublicKey }>,
    exportPrivateKey: (options: { key: { privateKey: PrivateKey }, passphrase: string }) => Promise<string>,
    importPrivateKey: (options: { armoredKey: string, passphrase: string }) => Promise<PrivateKey>,
    generateSessionKey: (options: { recipientKeys: PrivateKey[] }) => Promise<SessionKey>,
    decryptSessionKey: (options: { armoredMessage: string, decryptionKeys: PrivateKey[] }) => Promise<SessionKey | undefined>,
    encryptMessage: OpenPGPCryptoProxyEncryptMessage,
    decryptMessage: OpenPGPCryptoProxyDecryptMessage,
}

interface OpenPGPCryptoProxyEncryptMessage {
    (options: { textData?: string, binaryData?: Uint8Array, sessionKey?: SessionKey, signingKeys?: PrivateKey, encryptionKeys?: PublicKey[], detached?: boolean }): Promise<{ message: string, signature: string }>;
    (options: { format: 'binary', binaryData: Uint8Array, sessionKey: SessionKey, signingKeys: PrivateKey, encryptionKeys?: PublicKey[], detached: boolean }): Promise<{ message: Uint8Array, signature: Uint8Array }>;
}
interface OpenPGPCryptoProxyDecryptMessage {
    (options: { armoredMessage: string, signature: string, sessionKeys: SessionKey, verificationKeys: PublicKey[] }): Promise<{ data: string, verified: VERIFICATION_STATUS }>;
    (options: { format: 'binary', armoredMessage?: string, binaryMessage?: Uint8Array, signature?: string, binarySignature?: Uint8Array, sessionKeys?: SessionKey, decryptionKeys?: PrivateKey[], verificationKeys: PublicKey[] }): Promise<{ data: Uint8Array, verified: VERIFICATION_STATUS }>;
}

/**
 * Implementation of OpenPGPCrypto interface using CryptoProxy from clients
 * monorepo that must be passed as dependency. In the future, CryptoProxy
 * will be published separately and this implementation will use it directly.
 */
export class OpenPGPCryptoWithCryptoProxy implements OpenPGPCrypto {
    constructor(private cryptoProxy: OpenPGPCryptoProxy) {
        this.cryptoProxy = cryptoProxy;
    }

    generatePassphrase(): string {
        const value = crypto.getRandomValues(new Uint8Array(32));
        return uint8ArrayToBase64String(value);
    }

    async generateSessionKey(encryptionKeys: PrivateKey[]) {
        return this.cryptoProxy.generateSessionKey({ recipientKeys: encryptionKeys });
    }

    async generateKey(passphrase: string) {
        const key = await this.cryptoProxy.generateKey({
            userIDs: [{ name: 'Drive key' }],
            type: 'ecc',
            curve: 'ed25519Legacy',
        });

        const armoredKey = await this.cryptoProxy.exportPrivateKey({
            key,
            passphrase,
        });

        return {
            armoredKey,
            privateKey: key.privateKey,
        };
    }

    async encryptArmored(
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
    ) {
        const { message: armoredData } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            encryptionKeys,
        });
        return {
            armoredData,
        }
    }

    async encryptAndSign(
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) {
        const { message: encryptedData } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            signingKeys: signingKey,
            encryptionKeys,
            format: 'binary',
            detached: false,
        });
        return {
            encryptedData
        };
    }

    async encryptAndSignArmored(
        data: Uint8Array,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) {
        const { message: armoredData } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            encryptionKeys,
            signingKeys: signingKey,
            detached: false,
        });
        return {
            armoredData
        };
    }

    async encryptAndSignDetached(
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) {
        const { message: encryptedData, signature } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            signingKeys: signingKey,
            encryptionKeys,
            format: 'binary',
            detached: true,
        });
        return {
            encryptedData,
            signature,
        }
    }

    async encryptAndSignDetachedArmored(
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) {
        const { message: armoredData, signature: armoredSignature } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            signingKeys: signingKey,
            encryptionKeys,
            detached: true,
        });
        return {
            armoredData,
            armoredSignature,
        }
    }

    async decryptSessionKey(
        armoredPassphrase: string,
        decryptionKeys: PrivateKey[],
    ) {
        const sessionKey = await this.cryptoProxy.decryptSessionKey({
            armoredMessage: armoredPassphrase,
            decryptionKeys,
        });

        if (!sessionKey) {
            // TODO: error type & message
            throw new Error('Could not decrypt session key');
        }

        return sessionKey;
    }

    async decryptKey(
        armoredKey: string,
        passphrase: string,
    ) {
        const key = await this.cryptoProxy.importPrivateKey({
            armoredKey,
            passphrase,
        });
        return key;
    }

    async decryptArmoredAndVerify(
        armoredData: string,
        decryptionKeys: PrivateKey[],
        verificationKeys: PublicKey[],
    ) {
        const { data, verified } = await this.cryptoProxy.decryptMessage({
            armoredMessage: armoredData,
            decryptionKeys,
            verificationKeys,
            format: 'binary',
        });

        return {
            data,
            verified,
        }
    }

    async decryptArmoredAndVerifyDetached(
        armoredData: string,
        armoredSignature: string,
        sessionKey: SessionKey,
        verificationKeys: PublicKey[],
    ) {
        const { data, verified } = await this.cryptoProxy.decryptMessage({
            armoredMessage: armoredData,
            signature: armoredSignature,
            sessionKeys: sessionKey,
            verificationKeys,
            format: 'binary',
        });

        return {
            data,
            verified,
        }
    }
}
