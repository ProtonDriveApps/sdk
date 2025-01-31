import { OpenPGPCrypto, PrivateKey, PublicKey, SessionKey, VERIFICATION_STATUS } from './interface.js';

/**
 * Drive crypto layer to provide general operations for Drive crypto.
 * 
 * This layer focuses on providing general Drive crypto functions. Only
 * high-level functions that are required on multiple places should be
 * peresent. E.g., no specific implementation how keys are encrypted,
 * but we do share same key generation across shares and nodes modules,
 * for example, which we can generelise here and in each module just
 * call with specific arguments.
 */
export class DriveCrypto {
    constructor(private openPGPCrypto: OpenPGPCrypto) {
        this.openPGPCrypto = openPGPCrypto;
    }

    /**
     * It generates passphrase and key that is encrypted with the
     * generated passphrase.
     * 
     * `encrpytionKeys` are used to generate session key, which is
     * also used to encrypt the passphrase. The encrypted passphrase
     * is signed with `signingKey`.
     * 
     * @returns Object with:
     *  - encrypted (armored) data (key, passphrase and passphrase
     *    signature) for sending to the server
     *  - decrypted data (key, sessionKey) for crypto usage
     */
    async generateKey(
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ): Promise<{
        encrypted: {
            armoredKey: string,
            armoredPassphrase: string,
            armoredPassphraseSignature: string,
        },
        decrypted: {
            passphrase: string,
            key: PrivateKey,
            sessionKey: SessionKey,
        },
    }> {
        const passphrase = this.openPGPCrypto.generatePassphrase();
        const [{ privateKey, armoredKey }, sessionKey] = await Promise.all([
            this.openPGPCrypto.generateKey(passphrase),
            this.openPGPCrypto.generateSessionKey(encryptionKeys),
        ]);

        const { armoredPassphrase, armoredPassphraseSignature } = await this.encryptPassphrase(
            passphrase,
            sessionKey,
            encryptionKeys,
            signingKey,
        );

        return {
            encrypted: {
                armoredKey,
                armoredPassphrase,
                armoredPassphraseSignature,
            },
            decrypted: {
                passphrase,
                key: privateKey,
                sessionKey,
            },
        };
    };

    /**
     * It encrypts passphrase with provided session and encryption keys.
     * This should be used only for re-encrypting the passphrase with
     * different key (e.g., moving the node to different parent).
     * 
     * @returns Object with armored passphrase and passphrase signature.
     */
    async encryptPassphrase(
        passphrase: string,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ): Promise<{
        armoredPassphrase: string,
        armoredPassphraseSignature: string,
    }> {
        const { armoredData: armoredPassphrase, armoredSignature: armoredPassphraseSignature } = await this.openPGPCrypto.encryptAndSignDetachedArmored(
            new TextEncoder().encode(passphrase),
            sessionKey,
            encryptionKeys,
            signingKey,
        );

        return {
            armoredPassphrase,
            armoredPassphraseSignature,
        };
    }

    /**
     * It decrypts key generated via `generateKey`.
     * 
     * Armored data are passed from the server. `decryptionKeys` are used
     * to decrypt the session key from the `armoredPassphrase`. Then the
     * session key is used with `verificationKeys` to decrypt and verify
     * the passphrase. Finally, the armored key is decrypted.
     * 
     * Note: The function doesn't throw in case of verification issue.
     * You have to read `verified` result and act based on that.
     * 
     * @returns key and sessionKey for crypto usage, and verification status
     */
    async decryptKey(
        armoredKey: string,
        armoredPassphrase: string,
        armoredPassphraseSignature: string,
        decryptionKeys: PrivateKey[],
        verificationKeys: PublicKey[],
    ): Promise<{
        passphrase: string,
        key: PrivateKey,
        sessionKey: SessionKey,
        verified: VERIFICATION_STATUS,
    }> {
        const sessionKey = await this.openPGPCrypto.decryptSessionKey(
            armoredPassphrase,
            decryptionKeys,
        );

        const { data: decryptedPassphrase, verified } = await this.openPGPCrypto.decryptArmoredAndVerifyDetached(
            armoredPassphrase,
            armoredPassphraseSignature,
            sessionKey,
            verificationKeys,
        );

        const passphrase = new TextDecoder().decode(decryptedPassphrase);

        const key = await this.openPGPCrypto.decryptKey(
            armoredKey,
            passphrase,
        );
        return {
            passphrase,
            key,
            sessionKey,
            verified,
        };
    }

    /**
     * It encrypts and armors signature with provided session and encryption keys.
     */
    async encryptSignature(
        signature: Uint8Array,
        encryptionKey: PrivateKey,
        sessionKey: SessionKey,
    ): Promise<{
        armoredSignature: string,
    }> {
        const { armoredData: armoredSignature } = await this.openPGPCrypto.encryptArmored(
            signature,
            sessionKey,
            [encryptionKey],
        );
        return {
            armoredSignature,
        }
    }

    /**
     * It generates random 32 bytes that are encrypted and signed with
     * the provided key.
     */
    async generateHashKey(
        encryptionAndSigningKey: PrivateKey,
    ): Promise<{
        armoredHashKey: string,
        hashKey: Uint8Array,
    }> {
        // Once all clients can use non-ascii bytes, switch to simple
        // generating of random bytes without encoding it into base64:
        //const passphrase crypto.getRandomValues(new Uint8Array(32));
        const passphrase = this.openPGPCrypto.generatePassphrase();
        const hashKey = new TextEncoder().encode(passphrase);

        const { armoredData: armoredHashKey } = await this.openPGPCrypto.encryptAndSignArmored(
            hashKey,
            [encryptionAndSigningKey],
            encryptionAndSigningKey,
        );
        return {
            armoredHashKey,
            hashKey, 
        }
    }

    /**
     * It converts node name into bytes array and encrypts and signs
     * with provided keys.
     */
    async encryptNodeName(
        nodeName: string,
        encryptionKey: PrivateKey,
        signingKey: PrivateKey,
    ): Promise<{
        armoredNodeName: string,
    }> {
        const { armoredData: armoredNodeName } = await this.openPGPCrypto.encryptAndSignArmored(
            new TextEncoder().encode(nodeName),
            [encryptionKey],
            signingKey,
        );
        return {
            armoredNodeName,
        }
    }

    /**
     * It decrypts armored node name and verifies embeded signature.
     * 
     * Note: The function doesn't throw in case of verification issue.
     * You have to read `verified` result and act based on that.
     */
    async decryptNodeName(
        armoredNodeName: string,
        decryptionKey: PrivateKey,
        verificationKeys: PublicKey[],
    ): Promise<{
        name: string,
        verified: VERIFICATION_STATUS,
    }> {
        const { data: name, verified } = await this.openPGPCrypto.decryptArmoredAndVerify(
            armoredNodeName,
            [decryptionKey],
            verificationKeys,
        );
        return {
            name: new TextDecoder().decode(name),
            verified,
        }
    }

    /**
     * It decrypts armored node hash key and verifies embeded signature.
     * 
     * Note: The function doesn't throw in case of verification issue.
     * You have to read `verified` result and act based on that.
     */
    async decryptNodeHashKey(
        armoredHashKey: string,
        decryptionAndVerificationKey: PrivateKey,
        extraVerificationKeys: PublicKey[],
    ): Promise<{
        hashKey: Uint8Array,
        verified: VERIFICATION_STATUS,
    }> {
        // In the past, we had misunderstanding what key is used to sign hash
        // key. Originally, it meant to be the node key, which web used for all
        // nodes besides the root one, where address key was used instead.
        // Similarly, iOS or Android used address key for all nodes. Latest
        // versions should use node key in all cases, but we accept also
        // address key. Its still signed with a valid key.
        const { data: hashKey, verified } = await this.openPGPCrypto.decryptArmoredAndVerify(
            armoredHashKey,
            [decryptionAndVerificationKey],
            [decryptionAndVerificationKey, ...extraVerificationKeys],
        );
        return {
            hashKey,
            verified,
        };
    }
}
