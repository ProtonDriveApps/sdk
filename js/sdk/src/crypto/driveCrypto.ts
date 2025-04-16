import { OpenPGPCrypto, PrivateKey, PublicKey, SessionKey, VERIFICATION_STATUS } from './interface';
import { uint8ArrayToBase64String, base64StringToUint8Array } from './utils';
// FIXME: Switch to CryptoProxy module once available.
import { importHmacKey, computeHmacSignature } from "./hmac";

enum SIGNING_CONTEXTS {
    SHARING_INVITER = 'drive.share-member.inviter',
    SHARING_INVITER_EXTERNAL_INVITATION = 'drive.share-member.external-invitation',
    SHARING_MEMBER = 'drive.share-member.member',
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
            passphraseSessionKey: SessionKey,
        },
    }> {
        const passphrase = this.openPGPCrypto.generatePassphrase();
        const [{ privateKey, armoredKey }, passphraseSessionKey] = await Promise.all([
            this.openPGPCrypto.generateKey(passphrase),
            this.openPGPCrypto.generateSessionKey(encryptionKeys),
        ]);

        const { armoredPassphrase, armoredPassphraseSignature } = await this.encryptPassphrase(
            passphrase,
            passphraseSessionKey,
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
                passphraseSessionKey,
            },
        };
    };

    /**
     * It generates content key from node key for encrypting file blocks.
     *
     * @param encryptionKey - Its own node key.
     * @returns Object with serialised key packet and decrypted session key.
     */
    async generateContentKey(
        encryptionKey: PrivateKey,
    ): Promise<{
        encrypted: {
            base64ContentKeyPacket: string,
            armoredContentKeyPacketSignature: string,
        },
        decrypted: {
            contentKeyPacketSessionKey: SessionKey,
        },
    }> {
        const contentKeyPacketSessionKey = await this.openPGPCrypto.generateSessionKey([encryptionKey]);
        const { signature: armoredContentKeyPacketSignature } = await this.openPGPCrypto.signArmored(contentKeyPacketSessionKey.data, [encryptionKey]);
        const { keyPacket } = await this.openPGPCrypto.encryptSessionKey(contentKeyPacketSessionKey, [encryptionKey]);

        return {
            encrypted: {
                base64ContentKeyPacket: uint8ArrayToBase64String(keyPacket),
                armoredContentKeyPacketSignature,
            },
            decrypted: {
                contentKeyPacketSessionKey,
            }
        };
    }

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
        passphraseSessionKey: SessionKey,
        verified: VERIFICATION_STATUS,
    }> {
        const passphraseSessionKey = await this.decryptSessionKey(armoredPassphrase, decryptionKeys);

        const { data: decryptedPassphrase, verified } = await this.openPGPCrypto.decryptArmoredAndVerifyDetached(
            armoredPassphrase,
            armoredPassphraseSignature,
            passphraseSessionKey,
            verificationKeys,
        );

        const passphrase = uint8ArrayToUtf8(decryptedPassphrase);

        const key = await this.openPGPCrypto.decryptKey(
            armoredKey,
            passphrase,
        );
        return {
            passphrase,
            key,
            passphraseSessionKey,
            verified,
        };
    }

    /**
     * It encrypts session key with provided encryption key.
     */
    async encryptSessionKey(
        sessionKey: SessionKey,
        encryptionKey: PublicKey,
    ): Promise<{
        base64KeyPacket: string,
    }> {
        const { keyPacket } = await this.openPGPCrypto.encryptSessionKey(sessionKey, [encryptionKey]);
        return {
            base64KeyPacket: uint8ArrayToBase64String(keyPacket),
        }
    }

    /**
     * It decrypts session key from armored data.
     * 
     * `decryptionKeys` are used to decrypt the session key from the `armoredData`.
     */
    async decryptSessionKey(
        armoredData: string,
        decryptionKeys: PrivateKey[],
    ): Promise<SessionKey> {
        const sessionKey = await this.openPGPCrypto.decryptArmoredSessionKey(
            armoredData,
            decryptionKeys,
        );
        return sessionKey;
    }

    async decryptAndVerifySessionKey(
        base64data: string,
        armoredSignature: string | undefined,
        decryptionKeys: PrivateKey[],
        verificationKeys: PublicKey[],
    ): Promise<{
        sessionKey: SessionKey,
        verified?: VERIFICATION_STATUS,
    }> {
        
        const data = base64StringToUint8Array(base64data);

        const sessionKey = await this.openPGPCrypto.decryptSessionKey(
            data,
            decryptionKeys,
        );

        let verified;
        if (armoredSignature) {
            const result = await this.openPGPCrypto.verify(sessionKey.data, armoredSignature, verificationKeys);
            verified = result.verified;
        }

        return {
            sessionKey,
            verified,
        }
    }

    /**
     * It decrypts key similarly like `decryptKey`, but without signature
     * verification. This is used for invitations.
     */
    async decryptUnsignedKey(
        armoredKey: string,
        armoredPassphrase: string,
        decryptionKeys: PrivateKey[],
    ): Promise<PrivateKey> {
        const { data: decryptedPassphrase } = await this.openPGPCrypto.decryptArmoredAndVerify(
            armoredPassphrase,
            decryptionKeys,
            [],
        );

        const passphrase = uint8ArrayToUtf8(decryptedPassphrase);

        const key = await this.openPGPCrypto.decryptKey(
            armoredKey,
            passphrase,
        );

        return key;
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
            undefined,
            [encryptionAndSigningKey],
            encryptionAndSigningKey,
        );
        return {
            armoredHashKey,
            hashKey, 
        }
    }

    async generateLookupHash(newName: string, parentHashKey: Uint8Array): Promise<string> {
        const key = await importHmacKey(parentHashKey);

        const signature = await computeHmacSignature(key, new TextEncoder().encode(newName));
        return arrayToHexString(signature);
    }

    /**
     * It converts node name into bytes array and encrypts and signs
     * with provided keys.
     *
     * The function accepts either encryption or session key. Use encryption
     * key if you want to encrypt the name for the new node. Use session key
     * if you want to encrypt the new name for the existing node.
     */
    async encryptNodeName(
        nodeName: string,
        sessionKey: SessionKey | undefined,
        encryptionKey: PrivateKey | undefined,
        signingKey: PrivateKey,
    ): Promise<{
        armoredNodeName: string,
    }> {
        if (!sessionKey && !encryptionKey) {
            throw new Error('Neither session nor encryption key provided for encrypting node name');
        }

        const { armoredData: armoredNodeName } = await this.openPGPCrypto.encryptAndSignArmored(
            new TextEncoder().encode(nodeName),
            sessionKey,
            encryptionKey ? [encryptionKey] : [],
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
            name: uint8ArrayToUtf8(name),
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

    async encryptExtendedAttributes(
        extendedAttributes: string,
        encryptionKey: PrivateKey,
        signingKey: PrivateKey,
    ): Promise<{
        armoredExtendedAttributes: string,
    }> {
        const { armoredData: armoredExtendedAttributes } = await this.openPGPCrypto.encryptAndSignArmored(
            new TextEncoder().encode(extendedAttributes),
            undefined,
            [encryptionKey],
            signingKey,
        );
        return {
            armoredExtendedAttributes,
        };
    }

    async decryptExtendedAttributes(
        armoreExtendedAttributes: string,
        decryptionKey: PrivateKey,
        verificationKeys: PublicKey[],
    ): Promise<{
        extendedAttributes: string,
        verified: VERIFICATION_STATUS,
    }> {
        const { data: decryptedExtendedAttributes, verified } = await this.openPGPCrypto.decryptArmoredAndVerify(
            armoreExtendedAttributes,
            [decryptionKey],
            verificationKeys,
        );

        return {
            extendedAttributes: uint8ArrayToUtf8(decryptedExtendedAttributes),
            verified,
        };
    }

    async encryptInvitation(
        shareSessionKey: SessionKey,
        encryptionKey: PublicKey,
        signingKey: PrivateKey,
    ): Promise<{
        base64KeyPacket: string,
        base64KeyPacketSignature: string,
    }> {
        const { keyPacket } = await this.openPGPCrypto.encryptSessionKey(shareSessionKey, [encryptionKey]);
        const { signature: keyPacketSignature } = await this.openPGPCrypto.sign(
            keyPacket,
            signingKey,
            SIGNING_CONTEXTS.SHARING_INVITER,
        )
        return {
            base64KeyPacket: uint8ArrayToBase64String(keyPacket),
            base64KeyPacketSignature: uint8ArrayToBase64String(keyPacketSignature),
        }
    }

    async acceptInvitation(
        base64KeyPacket: string,
        signingKey: PrivateKey,
    ): Promise<{
        base64SessionKeySignature: string,
    }> {
        const sessionKey = await this.decryptSessionKey(
            base64KeyPacket,
            signingKey,
        );

        const { signature } = await this.openPGPCrypto.sign(
            sessionKey.data,
            signingKey,
            SIGNING_CONTEXTS.SHARING_MEMBER,
        );

        return {
            base64SessionKeySignature: uint8ArrayToBase64String(signature),
        }
    }

    async encryptExternalInvitation(
        shareSessionKey: SessionKey,
        signingKey: PrivateKey,
        inviteeEmail: string,
    ): Promise<{
        base64ExternalInvitationSignature: string,
    }> {
        const data = inviteeEmail.concat('|').concat(uint8ArrayToBase64String(shareSessionKey.data));

        const { signature: externalInviationSignature } = await this.openPGPCrypto.sign(
            new TextEncoder().encode(data),
            signingKey,
            SIGNING_CONTEXTS.SHARING_INVITER_EXTERNAL_INVITATION,
        )
        return {
            base64ExternalInvitationSignature: uint8ArrayToBase64String(externalInviationSignature),
        }
    }

    async encryptThumbnailBlock(
        thumbnailData: Uint8Array,
        sessionKey: SessionKey,
        signingKey: PrivateKey,
    ): Promise<{
        encryptedData: Uint8Array,
    }> {
        const { encryptedData } = await this.openPGPCrypto.encryptAndSign(
            thumbnailData,
            sessionKey,
            [], // Thumbnails use the session key so we do not send encryption key.
            signingKey,
        );

        return {
            encryptedData,
        };
    }

    async decryptThumbnailBlock(
        encryptedThumbnail: Uint8Array,
        sessionKey: SessionKey,
        verificationKeys: PublicKey[],
    ): Promise<{
        decryptedThumbnail: Uint8Array,
        verified: VERIFICATION_STATUS,
    }> {
        const { data: decryptedThumbnail, verified } = await this.openPGPCrypto.decryptAndVerify(
            encryptedThumbnail,
            sessionKey,
            verificationKeys,
        );
        return {
            decryptedThumbnail,
            verified,
        };
    }

    async encryptBlock(
        blockData: Uint8Array,
        encryptionKey: PrivateKey,
        sessionKey: SessionKey,
        signingKey: PrivateKey,
    ): Promise<{
        encryptedData: Uint8Array,
        armoredSignature: string,
    }> {
        const { encryptedData, signature } = await this.openPGPCrypto.encryptAndSignDetached(
            blockData,
            sessionKey,
            [], // Blocks use the session key so we do not send encryption key.
            signingKey,
        );

        const { armoredSignature } = await this.encryptSignature(signature, encryptionKey, sessionKey);

        return {
            encryptedData,
            armoredSignature,
        };
    }

    async decryptBlock(
        encryptedBlock: Uint8Array,
        armoredSignature: string | undefined,
        decryptionKey: PrivateKey,
        sessionKey: SessionKey,
        verificationKeys?: PublicKey[],
    ): Promise<{    
        decryptedBlock: Uint8Array,
        verified: VERIFICATION_STATUS,
    }> {
        const signature = armoredSignature ? await this.openPGPCrypto.decryptArmored(
            armoredSignature,
            [decryptionKey],
        ) : undefined;

        const { data: decryptedBlock, verified } = await this.openPGPCrypto.decryptAndVerifyDetached(
            encryptedBlock,
            signature,
            sessionKey,
            verificationKeys,
        );

        return {
            decryptedBlock,
            verified,
        };
    }

    async signManifest(
        manifest: Uint8Array,
        signingKey: PrivateKey,
    ): Promise<{
        armoredManifestSignature: string,
    }> {
        const { signature: armoredManifestSignature } = await this.openPGPCrypto.signArmored(
            manifest,
            signingKey,
        );
        return {
            armoredManifestSignature,
        }
    }

    async verifyManifest(
        manifest: Uint8Array,
        armoredSignature: string,
        verificationKeys: PublicKey[],
    ): Promise<{
        verified: VERIFICATION_STATUS,
    }> {
        const { verified } = await this.openPGPCrypto.verify(
            manifest,
            armoredSignature,
            verificationKeys,
        );
        return {
            verified,
        }
    }

    async decryptShareUrlPassword(
        armoredPassword: string,
        decryptionKeys: PrivateKey[],
    ): Promise<string> {
        const password = await this.openPGPCrypto.decryptArmored(
            armoredPassword,
            decryptionKeys,
        );
        return uint8ArrayToUtf8(password);
    }
}

export function uint8ArrayToUtf8(input: Uint8Array): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
}

/**
 * Convert an array of 8-bit integers to a hex string
 * @param bytes - Array of 8-bit integers to convert
 * @returns Hexadecimal representation of the array
 */
export const arrayToHexString = (bytes: Uint8Array) => {
    const hexAlphabet = '0123456789abcdef';
    let s = '';
    bytes.forEach((v) => {
        s += hexAlphabet[v >> 4] + hexAlphabet[v & 15];
    });
    return s;
};
