// TODO: Use CryptoProxy once available.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PublicKey = any;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PrivateKey extends PublicKey {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SessionKey = any;

export enum VERIFICATION_STATUS {
    NOT_SIGNED = 0,
    SIGNED_AND_VALID = 1,
    SIGNED_AND_INVALID = 2
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

    encryptSessionKey: (sessionKey: SessionKey, encryptionKeys: PublicKey[]) => Promise<{
        keyPacket: Uint8Array,
    }>,

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

    sign: (
        data: Uint8Array,
        signingKey: PrivateKey,
        signatureContext: string,
    ) => Promise<{
        signature: Uint8Array,
    }>,

    verify: (
        data: Uint8Array,
        armoredSignature: string,
        verificationKeys: PublicKey[],
    ) => Promise<{
        verified: VERIFICATION_STATUS,
    }>,

    decryptSessionKey: (
        data: Uint8Array,
        decryptionKeys: PrivateKey[],
    ) => Promise<SessionKey>,

    decryptArmoredSessionKey: (
        armoredData: string,
        decryptionKeys: PrivateKey[],
    ) => Promise<SessionKey>,

    decryptKey: (
        armoredKey: string,
        passphrase: string,
    ) => Promise<PrivateKey>,

    decryptAndVerify(
        data: Uint8Array,
        sessionKey: SessionKey,
        verificationKeys: PublicKey[],
    ): Promise<{
        data: Uint8Array,
        verified: VERIFICATION_STATUS,
    }>,

    decryptAndVerifyDetached(
        data: Uint8Array,
        signature: Uint8Array | undefined,
        sessionKey: SessionKey,
        verificationKeys?: PublicKey[],
    ): Promise<{
        data: Uint8Array,
        verified: VERIFICATION_STATUS,
    }>,

    decryptArmored(
        armoredData: string,
        decryptionKeys: PrivateKey[],
    ): Promise<Uint8Array>,

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
