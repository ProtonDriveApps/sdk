import { c } from 'ttag';

import { OpenPGPCrypto, PrivateKey, PublicKey, SessionKey, VERIFICATION_STATUS } from './interface';
import { uint8ArrayToBase64String } from './utils';

/**
 * Interface matching CryptoProxy interface from client's monorepo:
 * clients/packages/crypto/lib/proxy/proxy.ts.
 */
export interface OpenPGPCryptoProxy {
    generateKey: (options: {
        userIDs: { name: string }[];
        type: 'ecc';
        curve: 'ed25519Legacy';
        config?: { aeadProtect: boolean };
    }) => Promise<PrivateKey>;
    exportPrivateKey: (options: { privateKey: PrivateKey; passphrase: string | null }) => Promise<string>;
    importPrivateKey: (options: { armoredKey: string; passphrase: string | null }) => Promise<PrivateKey>;
    generateSessionKey: (options: {
        recipientKeys: PublicKey[];
        config?: { ignoreSEIPDv2FeatureFlag: boolean };
    }) => Promise<SessionKey>;
    encryptSessionKey: (
        options: SessionKey & {
            format: 'binary';
            encryptionKeys?: PublicKey | PublicKey[];
            passwords?: string[];
        },
    ) => Promise<Uint8Array<ArrayBuffer>>;
    decryptSessionKey: (options: {
        armoredMessage?: string;
        binaryMessage?: Uint8Array<ArrayBuffer>;
        decryptionKeys: PrivateKey | PrivateKey[];
    }) => Promise<SessionKey | undefined>;
    encryptMessage: <Format extends 'armored' | 'binary' = 'armored', Detached extends boolean = false>(options: {
        format?: Format;
        binaryData: Uint8Array<ArrayBuffer>;
        sessionKey?: SessionKey;
        encryptionKeys: PublicKey[];
        signingKeys?: PrivateKey;
        detached?: Detached;
        compress?: boolean;
        config?: { ignoreSEIPDv2FeatureFlag: boolean };
    }) => Promise<
        Detached extends true
            ? {
                  message: Format extends 'binary' ? Uint8Array<ArrayBuffer> : string;
                  signature: Format extends 'binary' ? Uint8Array<ArrayBuffer> : string;
              }
            : {
                  message: Format extends 'binary' ? Uint8Array<ArrayBuffer> : string;
              }
    >;
    decryptMessage: <Format extends 'utf8' | 'binary' = 'utf8'>(options: {
        format: Format;
        armoredMessage?: string;
        binaryMessage?: Uint8Array<ArrayBuffer>;
        armoredSignature?: string;
        binarySignature?: Uint8Array<ArrayBuffer>;
        sessionKeys?: SessionKey;
        passwords?: string[];
        decryptionKeys?: PrivateKey | PrivateKey[];
        verificationKeys?: PublicKey | PublicKey[];
    }) => Promise<{
        data: Format extends 'binary' ? Uint8Array<ArrayBuffer> : string;
        verificationStatus: VERIFICATION_STATUS;
        verificationErrors?: Error[];
    }>;
    signMessage: <Format extends 'binary' | 'armored' = 'armored'>(options: {
        format: Format;
        binaryData: Uint8Array<ArrayBuffer>;
        signingKeys: PrivateKey | PrivateKey[];
        detached: boolean;
        signatureContext?: { critical: boolean; value: string };
    }) => Promise<Format extends 'binary' ? Uint8Array<ArrayBuffer> : string>;
    verifyMessage: (options: {
        binaryData: Uint8Array<ArrayBuffer>;
        armoredSignature?: string;
        binarySignature?: Uint8Array<ArrayBuffer>;
        verificationKeys: PublicKey | PublicKey[];
        signatureContext?: { critical: boolean; value: string };
    }) => Promise<{
        verificationStatus: VERIFICATION_STATUS;
        errors?: Error[];
    }>;
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
        // TODO: Once all clients can use non-ascii bytes, switch to simple
        // generating of random bytes without encoding it into base64.
        return uint8ArrayToBase64String(value);
    }

    async generateSessionKey(encryptionKeys: PublicKey[], options: { enableAeadWithEncryptionKeys: boolean }) {
        return this.cryptoProxy.generateSessionKey({
            recipientKeys: encryptionKeys,
            // `ignoreSEIPDv2FeatureFlag` means that the key preferences are
            // ignored. If set to `true`, the session key will be generated
            // the standard non-AEAD algorithm. If set to `false`, the session
            // key will always follow the encryption key preferences.
            config: { ignoreSEIPDv2FeatureFlag: !options.enableAeadWithEncryptionKeys },
        });
    }

    async encryptSessionKey(sessionKey: SessionKey, encryptionKeys: PublicKey | PublicKey[]) {
        const keyPacket = await this.cryptoProxy.encryptSessionKey({
            ...sessionKey,
            format: 'binary',
            encryptionKeys,
        });
        return {
            keyPacket,
        };
    }

    async encryptSessionKeyWithPassword(sessionKey: SessionKey, password: string) {
        const keyPacket = await this.cryptoProxy.encryptSessionKey({
            ...sessionKey,
            format: 'binary',
            passwords: [password],
        });
        return {
            keyPacket,
        };
    }

    async generateKey(passphrase: string, options: { enableAead: boolean }) {
        const privateKey = await this.cryptoProxy.generateKey({
            userIDs: [{ name: 'Drive key' }],
            type: 'ecc',
            curve: 'ed25519Legacy',
            config: { aeadProtect: options.enableAead },
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
        data: Uint8Array<ArrayBuffer>,
        encryptionKeys: PublicKey[],
        sessionKey: SessionKey | undefined,
        options: { enableAeadWithEncryptionKeys: boolean },
    ) {
        const { message: armoredData } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            encryptionKeys,
            // `ignoreSEIPDv2FeatureFlag` means that the key preferences are
            // ignored. If set to `true`, the encrypted data will be generated
            // the standard non-AEAD algorithm. If set to `false`, the session
            // key will always follow the encryption key preferences.
            config: { ignoreSEIPDv2FeatureFlag: !options.enableAeadWithEncryptionKeys },
        });
        return {
            armoredData: armoredData,
        };
    }

    async encryptAndSign(
        data: Uint8Array<ArrayBuffer>,
        sessionKey: SessionKey,
        encryptionKeys: PublicKey[],
        signingKey: PrivateKey,
        options: { compress?: boolean; enableAeadWithEncryptionKeys: boolean },
    ) {
        const { message: encryptedData } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            signingKeys: signingKey,
            encryptionKeys,
            format: 'binary',
            detached: false,
            // `ignoreSEIPDv2FeatureFlag` means that the key preferences are
            // ignored. If set to `true`, the encrypted data will be generated
            // the standard non-AEAD algorithm. If set to `false`, the session
            // key will always follow the encryption key preferences.
            config: { ignoreSEIPDv2FeatureFlag: !options.enableAeadWithEncryptionKeys },
        });
        return {
            encryptedData: encryptedData,
        };
    }

    async encryptAndSignArmored(
        data: Uint8Array<ArrayBuffer>,
        sessionKey: SessionKey | undefined,
        encryptionKeys: PublicKey[],
        signingKey: PrivateKey,
        options: { compress?: boolean; enableAeadWithEncryptionKeys: boolean },
    ) {
        const { message: armoredData } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            encryptionKeys,
            sessionKey,
            signingKeys: signingKey,
            detached: false,
            compress: options.compress || false,
            // `ignoreSEIPDv2FeatureFlag` means that the key preferences are
            // ignored. If set to `true`, the encrypted data will be generated
            // the standard non-AEAD algorithm. If set to `false`, the session
            // key will always follow the encryption key preferences.
            config: { ignoreSEIPDv2FeatureFlag: !options.enableAeadWithEncryptionKeys },
        });
        return {
            armoredData: armoredData,
        };
    }

    async encryptAndSignDetached(
        data: Uint8Array<ArrayBuffer>,
        sessionKey: SessionKey,
        encryptionKeys: PublicKey[],
        signingKey: PrivateKey,
        options: { enableAeadWithEncryptionKeys: boolean },
    ) {
        const { message: encryptedData, signature } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            signingKeys: signingKey,
            encryptionKeys,
            format: 'binary',
            detached: true,
            // `ignoreSEIPDv2FeatureFlag` means that the key preferences are
            // ignored. If set to `true`, the encrypted data will be generated
            // the standard non-AEAD algorithm. If set to `false`, the session
            // key will always follow the encryption key preferences.
            config: { ignoreSEIPDv2FeatureFlag: !options.enableAeadWithEncryptionKeys },
        });
        return {
            encryptedData: encryptedData,
            signature: signature,
        };
    }

    async encryptAndSignDetachedArmored(
        data: Uint8Array<ArrayBuffer>,
        sessionKey: SessionKey,
        encryptionKeys: PublicKey[],
        signingKey: PrivateKey,
        options: { enableAeadWithEncryptionKeys: boolean },
    ) {
        const { message: armoredData, signature: armoredSignature } = await this.cryptoProxy.encryptMessage({
            binaryData: data,
            sessionKey,
            signingKeys: signingKey,
            encryptionKeys,
            detached: true,
            // `ignoreSEIPDv2FeatureFlag` means that the key preferences are
            // ignored. If set to `true`, the encrypted data will be generated
            // the standard non-AEAD algorithm. If set to `false`, the session
            // key will always follow the encryption key preferences.
            config: { ignoreSEIPDv2FeatureFlag: !options.enableAeadWithEncryptionKeys },
        });
        return {
            armoredData: armoredData,
            armoredSignature: armoredSignature,
        };
    }

    async sign(data: Uint8Array<ArrayBuffer>, signingKeys: PrivateKey | PrivateKey[], signatureContext: string) {
        const signature = await this.cryptoProxy.signMessage({
            binaryData: data,
            signingKeys,
            detached: true,
            format: 'binary',
            signatureContext: { critical: true, value: signatureContext },
        });
        return {
            signature: signature,
        };
    }

    async signArmored(data: Uint8Array<ArrayBuffer>, signingKeys: PrivateKey | PrivateKey[]) {
        const signature = await this.cryptoProxy.signMessage({
            binaryData: data,
            signingKeys,
            detached: true,
            format: 'armored',
        });
        return {
            signature: signature,
        };
    }

    async verify(
        data: Uint8Array<ArrayBuffer>,
        signature: Uint8Array<ArrayBuffer>,
        verificationKeys: PublicKey | PublicKey[],
    ) {
        const { verificationStatus, errors } = await this.cryptoProxy.verifyMessage({
            binaryData: data,
            binarySignature: signature,
            verificationKeys,
        });
        return {
            verified: verificationStatus,
            verificationErrors: errors,
        };
    }

    async verifyArmored(
        data: Uint8Array<ArrayBuffer>,
        armoredSignature: string,
        verificationKeys: PublicKey | PublicKey[],
        signatureContext?: string,
    ) {
        const { verificationStatus, errors } = await this.cryptoProxy.verifyMessage({
            binaryData: data,
            armoredSignature,
            verificationKeys,
            signatureContext: signatureContext ? { critical: true, value: signatureContext } : undefined,
        });

        return {
            verified: verificationStatus,
            verificationErrors: errors,
        };
    }

    async decryptSessionKey(data: Uint8Array<ArrayBuffer>, decryptionKeys: PrivateKey | PrivateKey[]) {
        const sessionKey = await this.cryptoProxy.decryptSessionKey({
            binaryMessage: data,
            decryptionKeys,
        });

        if (!sessionKey) {
            throw new Error('Could not decrypt session key');
        }

        // Encrypted OpenPGP v6 session keys used for AEAD do not store algorithm information, so we hardcode it
        if (sessionKey.algorithm === null) {
            sessionKey.algorithm = 'aes256';
            sessionKey.aeadAlgorithm = 'gcm';
        }

        return sessionKey;
    }

    async decryptArmoredSessionKey(armoredData: string, decryptionKeys: PrivateKey | PrivateKey[]) {
        const sessionKey = await this.cryptoProxy.decryptSessionKey({
            armoredMessage: armoredData,
            decryptionKeys,
        });

        if (!sessionKey) {
            throw new Error('Could not decrypt session key');
        }

        return sessionKey;
    }

    async decryptKey(armoredKey: string, passphrase: string) {
        const key = await this.cryptoProxy.importPrivateKey({
            armoredKey,
            passphrase,
        });
        return key;
    }

    async decryptAndVerify(data: Uint8Array<ArrayBuffer>, sessionKey: SessionKey, verificationKeys: PublicKey[]) {
        const {
            data: decryptedData,
            verificationStatus,
            verificationErrors,
        } = await this.cryptoProxy.decryptMessage({
            binaryMessage: data,
            sessionKeys: sessionKey,
            verificationKeys,
            format: 'binary',
        });

        return {
            data: decryptedData,
            verified: verificationStatus,
            verificationErrors,
        };
    }

    async decryptAndVerifyDetached(
        data: Uint8Array<ArrayBuffer>,
        signature: Uint8Array<ArrayBuffer> | undefined,
        sessionKey: SessionKey,
        verificationKeys?: PublicKey[],
    ) {
        const {
            data: decryptedData,
            verificationStatus,
            verificationErrors,
        } = await this.cryptoProxy.decryptMessage({
            binaryMessage: data,
            binarySignature: signature,
            sessionKeys: sessionKey,
            verificationKeys,
            format: 'binary',
        });

        return {
            data: decryptedData,
            verified: verificationStatus,
            verificationErrors,
        };
    }

    async decryptArmored(armoredData: string, decryptionKeys: PrivateKey | PrivateKey[]) {
        const { data } = await this.cryptoProxy.decryptMessage({
            armoredMessage: armoredData,
            decryptionKeys,
            format: 'binary',
        });
        return data;
    }

    async decryptArmoredAndVerify(
        armoredData: string,
        decryptionKeys: PrivateKey | PrivateKey[],
        verificationKeys: PublicKey | PublicKey[],
    ) {
        const { data, verificationStatus, verificationErrors } = await this.cryptoProxy.decryptMessage({
            armoredMessage: armoredData,
            decryptionKeys,
            verificationKeys,
            format: 'binary',
        });

        return {
            data: data,
            verified: verificationStatus,
            verificationErrors,
        };
    }

    async decryptArmoredAndVerifyDetached(
        armoredData: string,
        armoredSignature: string | undefined,
        sessionKey: SessionKey,
        verificationKeys: PublicKey | PublicKey[],
    ) {
        const { data, verificationStatus, verificationErrors } = await this.cryptoProxy.decryptMessage({
            armoredMessage: armoredData,
            armoredSignature,
            sessionKeys: sessionKey,
            verificationKeys,
            format: 'binary',
        });

        return {
            data: data,
            verified: verificationStatus,
            verificationErrors: !armoredSignature
                ? [new Error(c('Error').t`Signature is missing`)]
                : verificationErrors,
        };
    }

    async decryptArmoredWithPassword(armoredData: string, password: string) {
        const { data } = await this.cryptoProxy.decryptMessage({
            armoredMessage: armoredData,
            passwords: [password],
            format: 'binary',
        });
        return data;
    }
}
