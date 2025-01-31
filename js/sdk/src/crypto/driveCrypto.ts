import { OpenPGPCrypto, DriveCrypto, PrivateKey, PublicKey, SessionKey } from './interface.js';

/**
 * See interface for more info.
 */
export function driveCrypto(openPGPCrypto: OpenPGPCrypto): DriveCrypto {
    async function generateKey(encryptionKeys: PrivateKey[], signingKey: PrivateKey) {
        const passphrase = openPGPCrypto.generatePassphrase();
        const [{ privateKey, armoredKey }, sessionKey] = await Promise.all([
            openPGPCrypto.generateKey(passphrase),
            openPGPCrypto.generateSessionKey(encryptionKeys),
        ]);

        const { armoredPassphrase, armoredPassphraseSignature } = await encryptPassphrase(
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

    async function encryptPassphrase(
        passphrase: string,
        sessionKey: SessionKey,
        encryptionKeys: PrivateKey[],
        signingKey: PrivateKey,
    ) {
        const { armoredData: armoredPassphrase, armoredSignature: armoredPassphraseSignature } = await openPGPCrypto.encryptAndSignDetachedArmored(
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

    async function decryptKey(
        armoredKey: string,
        armoredPassphrase: string,
        armoredPassphraseSignature: string,
        decryptionKeys: PrivateKey[],
        verificationKeys: PublicKey[],
    ) {
        const sessionKey = await openPGPCrypto.decryptSessionKey(
            armoredPassphrase,
            decryptionKeys,
        );

        const { data: decryptedPassphrase, verified } = await openPGPCrypto.decryptArmoredAndVerifyDetached(
            armoredPassphrase,
            armoredPassphraseSignature,
            sessionKey,
            verificationKeys,
        );

        const passphrase = new TextDecoder().decode(decryptedPassphrase);

        const key = await openPGPCrypto.decryptKey(
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

    async function encryptSignature(
        signature: Uint8Array,
        encryptionKey: PrivateKey,
        sessionKey: SessionKey,
    ) {
        const { armoredData: armoredSignature } = await openPGPCrypto.encryptArmored(
            signature,
            sessionKey,
            [encryptionKey],
        );
        return {
            armoredSignature,
        }
    }

    async function generateHashKey(
        encryptionAndSigningKey: PrivateKey,
    ) {
        // Once all clients can use non-ascii bytes, switch to simple
        // generating of random bytes without encoding it into base64:
        //const passphrase crypto.getRandomValues(new Uint8Array(32));
        const passphrase = openPGPCrypto.generatePassphrase();
        const hashKey = new TextEncoder().encode(passphrase);

        const { armoredData: armoredHashKey } = await openPGPCrypto.encryptAndSignArmored(
            hashKey,
            [encryptionAndSigningKey],
            encryptionAndSigningKey,
        );
        return {
            armoredHashKey,
            hashKey, 
        }
    }

    async function encryptNodeName(
        nodeName: string,
        encryptionKey: PrivateKey,
        signingKey: PrivateKey,
    ) {
        const { armoredData: armoredNodeName } = await openPGPCrypto.encryptAndSignArmored(
            new TextEncoder().encode(nodeName),
            [encryptionKey],
            signingKey,
        );
        return {
            armoredNodeName,
        }
    }

    async function decryptNodeName(
        armoredNodeName: string,
        decryptionKey: PrivateKey,
        verificationKeys: PublicKey[],
    ) {
        const { data: name, verified } = await openPGPCrypto.decryptArmoredAndVerify(
            armoredNodeName,
            [decryptionKey],
            verificationKeys,
        );
        return {
            name: new TextDecoder().decode(name),
            verified,
        }
    }

    async function decryptNodeHashKey(
        armoredHashKey: string,
        decryptionAndVerificationKey: PrivateKey,
        extraVerificationKeys: PublicKey[],
    ) {
        // In the past, we had misunderstanding what key is used to sign hash
        // key. Originally, it meant to be the node key, which web used for all
        // nodes besides the root one, where address key was used instead.
        // Similarly, iOS or Android used address key for all nodes. Latest
        // versions should use node key in all cases, but we accept also
        // address key. Its still signed with a valid key.
        const { data: hashKey, verified } = await openPGPCrypto.decryptArmoredAndVerify(
            armoredHashKey,
            [decryptionAndVerificationKey],
            [decryptionAndVerificationKey, ...extraVerificationKeys],
        );
        return {
            hashKey,
            verified,
        };
    }
    
    return {
        generateKey,
        encryptPassphrase,
        decryptKey,
        encryptSignature,
        generateHashKey,
        encryptNodeName,
        decryptNodeName,
        decryptNodeHashKey,
    }
}
