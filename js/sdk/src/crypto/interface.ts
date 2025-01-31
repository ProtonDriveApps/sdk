// TODO: Re-export them from openpgp/CryptoProxy directly.
// Depeding on openpgp requires additional setup for tests, so we can't do it yet.
export type PrivateKey = {
    armor(): string;
};

export type PublicKey = {
    armor(): string;
};

export type SessionKey = {
    data: Uint8Array,
    algorithm: string,
    aeadAlgorithm?: string,
};

export enum VERIFICATION_STATUS {
    NOT_SIGNED = 0,
    SIGNED_AND_VALID = 1,
    SIGNED_AND_INVALID = 2
}

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
export interface DriveCrypto {
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
    generateKey: (
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
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
    }>,

    /**
     * It encrypts passphrase with provided session and encryption keys.
     * This should be used only for re-encrypting the passphrase with
     * different key (e.g., moving the node to different parent).
     * 
     * @returns Object with armored passphrase and passphrase signature.
     */
    encryptPassphrase: (
        passphrase: string,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        armoredPassphrase: string,
        armoredPassphraseSignature: string,
    }>,

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
    decryptKey: (
        armoredKey: string,
        armoredPassphrase: string,
        armoredPassphraseSignature: string,
        decryptionKeys: PrivateKey[],
        verificationKeys: PublicKey[],
    ) => Promise<{
        passphrase: string,
        key: PrivateKey,
        sessionKey: SessionKey,
        verified: VERIFICATION_STATUS,
    }>,

    /**
     * It encrypts and armors signature with provided session and encryption keys.
     */
    encryptSignature: (
        signature: Uint8Array,
        encryptionKey: PrivateKey,
        sessionKey: SessionKey,
    ) => Promise<{
        armoredSignature: string,
    }>,

    /**
     * It generates random 32 bytes that are encrypted and signed with
     * the provided key.
     */
    generateHashKey: (
        encryptionAndSigningKey: PrivateKey,
    ) => Promise<{
        armoredHashKey: string,
        hashKey: Uint8Array,
    }>,

    /**
     * It converts node name into bytes array and encrypts and signs
     * with provided keys.
     */
    encryptNodeName: (
        nodeName: string,
        encryptionKey: PrivateKey,
        signingKey: PrivateKey,
    ) => Promise<{
        armoredNodeName: string,
    }>,

    /**
     * It decrypts armored node name and verifies embeded signature.
     * 
     * Note: The function doesn't throw in case of verification issue.
     * You have to read `verified` result and act based on that.
     */
    decryptNodeName: (
        armoredNodeName: string,
        encryptionKey: PrivateKey,
        verificationKeys: PublicKey[],
    ) => Promise<{
        name: string,
        verified: VERIFICATION_STATUS,
    }>,

    /**
     * It decrypts armored node hash key and verifies embeded signature.
     * 
     * Note: The function doesn't throw in case of verification issue.
     * You have to read `verified` result and act based on that.
     */
    decryptNodeHashKey: (
        armoredNodeName: string,
        decryptionAndVerificationKey: PrivateKey,
        extraVerificationKeys: PublicKey[],
    ) => Promise<{
        hashKey: Uint8Array,
        verified: VERIFICATION_STATUS,
    }>,
}

/**
 * OpenPGP crypto layer to provide necessary PGP operations for Drive crypto.
 * 
 * This layer focuses on providing general openPGP functions. Every operation
 * should prefer binary input and output. Ideally, armoring should be done
 * later in serialisation step, but for now, it is part of the interface to
 * be somewhat compatible with current web app, and also be more efficient
 * (current CryptoProxy can do encryption and armoring in one operation with
 * less passing data between web workers). In the future, we want to separate
 * this out of here more.
 */
export interface OpenPGPCrypto {
    /**
     * Generate a random passphrase.
     * 
     * 32 random bytes are generated and encoded into a base64 string.
     */
    generatePassphrase: () => string,

    generateSessionKey: (encryptionKeys: PrivateKey[]) => Promise<SessionKey>,

    /**
     * Generate a new key pair locked by a passphrase.
     * 
     * The key pair is generated using the Curve25519 algorithm.
     */
    generateKey: (passphrase: string) => Promise<{
        privateKey: PrivateKey,
        armoredKey: string,
    }>,

    encryptArmored: (
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
    ) => Promise<{
        armoredData: string,
    }>,

    encryptAndSign: (
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        encryptedData: Uint8Array,
    }>,

    encryptAndSignArmored: (
        data: Uint8Array,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        armoredData: string,
    }>,

    encryptAndSignDetached: (
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        encryptedData: Uint8Array,
        signature: Uint8Array,
    }>,

    encryptAndSignDetachedArmored: (
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        armoredData: string,
        armoredSignature: string,
    }>,

    decryptSessionKey: (
        armoredPassphrase: string,
        decryptionKeys: PrivateKey[],
    ) => Promise<SessionKey>,

    decryptKey: (
        armoredKey: string,
        passphrase: string,
    ) => Promise<PrivateKey>,

    decryptArmoredAndVerify: (
        armoredData: string,
        decryptionKeys: PrivateKey[],
        verificationKeys: PublicKey[],
    ) => Promise<{
        data: Uint8Array,
        verified: VERIFICATION_STATUS,
    }>,

    decryptArmoredAndVerifyDetached: (
        armoredData: string,
        armoredSignature: string,
        sessionKey: SessionKey,
        verificationKeys: PublicKey[],
    ) => Promise<{
        data: Uint8Array,
        verified: VERIFICATION_STATUS,
    }>,
}
