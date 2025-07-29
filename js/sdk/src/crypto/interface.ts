// TODO: Use CryptoProxy once available.
export interface PublicKey {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly _idx: any;
    readonly _keyContentHash: [string, string];

    getVersion(): number;
    getFingerprint(): string;
    getSHA256Fingerprints(): string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getKeyID(): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getKeyIDs(): any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getAlgorithmInfo(): any;
    getCreationTime(): Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isPrivate: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isPrivateKeyV4: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isPrivateKeyV6: any;
    getExpirationTime(): Date | number | null;
    getUserIDs(): string[];
    isWeak(): boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    equals(otherKey: any, ignoreOtherCerts?: boolean): boolean;
    subkeys: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getAlgorithmInfo(): any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getKeyID(): any;
    }[];
}

export interface PrivateKey extends PublicKey {
    readonly _dummyType: 'private';
}

export interface SessionKey {
    data: Uint8Array;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algorithm: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aeadAlgorithm?: any;
}

export enum VERIFICATION_STATUS {
    NOT_SIGNED = 0,
    SIGNED_AND_VALID = 1,
    SIGNED_AND_INVALID = 2,
}

export interface SRPModule {
    getSrpVerifier: (password: string) => Promise<SRPVerifier>;
    computeKeyPassword: (password: string, salt: string) => Promise<string>;
}

export type SRPVerifier = {
    modulusId: string;
    version: number;
    salt: string;
    verifier: string;
};

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
    generatePassphrase: () => string;

    generateSessionKey: (encryptionKeys: PrivateKey[]) => Promise<SessionKey>;

    encryptSessionKey: (
        sessionKey: SessionKey,
        encryptionKeys: PublicKey | PublicKey[],
    ) => Promise<{
        keyPacket: Uint8Array;
    }>;

    encryptSessionKeyWithPassword: (
        sessionKey: SessionKey,
        password: string,
    ) => Promise<{
        keyPacket: Uint8Array;
    }>;

    /**
     * Generate a new key pair locked by a passphrase.
     *
     * The key pair is generated using the Curve25519 algorithm.
     */
    generateKey: (passphrase: string) => Promise<{
        privateKey: PrivateKey;
        armoredKey: string;
    }>;

    encryptArmored: (
        data: Uint8Array,
        encryptionKeys: PrivateKey[],
        sessionKey?: SessionKey,
    ) => Promise<{
        armoredData: string;
    }>;

    encryptAndSign: (
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        encryptedData: Uint8Array;
    }>;

    encryptAndSignArmored: (
        data: Uint8Array,
        sessionKey: SessionKey | undefined,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        armoredData: string;
    }>;

    encryptAndSignDetached: (
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        encryptedData: Uint8Array;
        signature: Uint8Array;
    }>;

    encryptAndSignDetachedArmored: (
        data: Uint8Array,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) => Promise<{
        armoredData: string;
        armoredSignature: string;
    }>;

    sign: (
        data: Uint8Array,
        signingKey: PrivateKey,
        signatureContext: string,
    ) => Promise<{
        signature: Uint8Array;
    }>;

    signArmored: (
        data: Uint8Array,
        signingKey: PrivateKey | PrivateKey[],
    ) => Promise<{
        signature: string;
    }>;

    verify: (
        data: Uint8Array,
        armoredSignature: string,
        verificationKeys: PublicKey | PublicKey[],
    ) => Promise<{
        verified: VERIFICATION_STATUS;
    }>;

    decryptSessionKey: (data: Uint8Array, decryptionKeys: PrivateKey | PrivateKey[]) => Promise<SessionKey>;

    decryptArmoredSessionKey: (armoredData: string, decryptionKeys: PrivateKey | PrivateKey[]) => Promise<SessionKey>;

    decryptKey: (armoredKey: string, passphrase: string) => Promise<PrivateKey>;

    decryptAndVerify(
        data: Uint8Array,
        sessionKey: SessionKey,
        verificationKeys: PublicKey | PublicKey[],
    ): Promise<{
        data: Uint8Array;
        verified: VERIFICATION_STATUS;
    }>;

    decryptAndVerifyDetached(
        data: Uint8Array,
        signature: Uint8Array | undefined,
        sessionKey: SessionKey,
        verificationKeys?: PublicKey | PublicKey[],
    ): Promise<{
        data: Uint8Array;
        verified: VERIFICATION_STATUS;
    }>;

    decryptArmored(armoredData: string, decryptionKeys: PrivateKey | PrivateKey[]): Promise<Uint8Array>;

    decryptArmoredAndVerify: (
        armoredData: string,
        decryptionKeys: PrivateKey | PrivateKey[],
        verificationKeys: PublicKey | PublicKey[],
    ) => Promise<{
        data: Uint8Array;
        verified: VERIFICATION_STATUS;
    }>;

    decryptArmoredAndVerifyDetached: (
        armoredData: string,
        armoredSignature: string,
        sessionKey: SessionKey,
        verificationKeys: PublicKey | PublicKey[],
    ) => Promise<{
        data: Uint8Array;
        verified: VERIFICATION_STATUS;
    }>;

    decryptArmoredWithPassword(armoredData: string, password: string): Promise<Uint8Array>;
}
