import { OpenPGPCrypto, PrivateKey, PublicKey, SessionKey, VERIFICATION_STATUS } from './interface';
import { uint8ArrayToBase64String } from './utils';

/**
 * Interface matching CryptoProxy interface from client's monorepo:
 * clients/packages/crypto/lib/proxy/proxy.ts.
 */
interface OpenPGPCryptoProxy {
    generateKey: (options: { userIDs: { name: string }[], type: 'ecc', curve: 'ed25519' }) => Promise<PrivateKey>,
    exportPrivateKey: (options: { privateKey: PrivateKey, passphrase: string }) => Promise<string>,
    importPrivateKey: (options: { armoredKey: string, passphrase: string }) => Promise<PrivateKey>,
    generateSessionKey: (options: { recipientKeys: PrivateKey[] }) => Promise<SessionKey>,
    decryptSessionKey: (options: { armoredMessage: string, decryptionKeys: PrivateKey[] }) => Promise<SessionKey | undefined>,
    encryptMessage: (options: {
        format?: 'armored' | 'binary',
        binaryData: Uint8Array,
        sessionKey?: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKeys?: PrivateKey,
        detached?: boolean,
    }) => Promise<{
        message: string | Uint8Array,
        signature?: string | Uint8Array,
    }>,
    decryptMessage: (options: {
        format: 'utf8' | 'binary',
        armoredMessage?: string,
        binaryMessage?: Uint8Array,
        armoredSignature?: string,
        binarySignature?: Uint8Array,
        sessionKeys?: SessionKey,
        decryptionKeys?: PrivateKey[],
        verificationKeys: PublicKey[]
    }) => Promise<{
        data: Uint8Array | string,
        verified: VERIFICATION_STATUS
    }>,
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
        const privateKey = await this.cryptoProxy.generateKey({
            userIDs: [{ name: 'Drive key' }],
            type: 'ecc',
            // @ts-expect-error The interface doesnt officially accept it anymore, but legacy is still supported.
            curve: 'ed25519Legacy',
        });

        const armoredKey = await this.cryptoProxy.exportPrivateKey({
            privateKey,
            passphrase,
        });

        return {
            armoredKey,
            privateKey,
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
            armoredData: armoredData as string,
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
            encryptedData: encryptedData as Uint8Array,
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
            armoredData: armoredData as string,
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
            encryptedData: encryptedData as Uint8Array,
            signature: signature as Uint8Array,
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
            armoredData: armoredData as string,
            armoredSignature: armoredSignature as string,
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
            data: data as Uint8Array,
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
            armoredSignature,
            sessionKeys: sessionKey,
            verificationKeys,
            format: 'binary',
        });

        return {
            data: data as Uint8Array,
            verified,
        }
    }
}
