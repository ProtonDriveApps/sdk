import { Api as CryptoApi } from '@protontech/crypto/proxy/endpoint/api.ts';

import {
    DriveCrypto,
    OpenPGPCryptoWithCryptoProxy,
    PrivateKey,
    VERIFICATION_STATUS,
} from '../crypto';
import {
    AnonymousUser,
    MemberRole,
    NodeType,
    ProtonDriveAccount,
    ProtonDriveTelemetry,
} from '../interface';
import { NodesCryptoReporter } from '../internal/nodes/cryptoReporter';
import { NodesCryptoService } from '../internal/nodes/cryptoService';
import {
    DecryptedUnparsedNode,
    EncryptedNode,
    EncryptedNodeFolderCrypto,
    NodeSigningKeys,
    SharesService,
} from '../internal/nodes/interface';
import { getMockTelemetry } from '../tests/telemetry';

describe('NodesCryptoService', () => {
    // Crypto setup for testing with pre-generated keys
    let cryptoProxy: CryptoApi;
    let openPGPCrypto: OpenPGPCryptoWithCryptoProxy;

    const addressEmail = 'test@proton.me';
    let addressKey: PrivateKey;
    let signingAddressKey: NodeSigningKeys;
    let signingNodeKeys: NodeSigningKeys;
    let parentKey: PrivateKey;
    const hashKey = new Uint8Array([
        43, 113, 49, 106, 76, 114, 74, 54, 78, 105, 75, 83, 70, 47, 55, 47, 54, 101, 66, 52, 122, 103, 66, 65, 101, 85,
        121, 103, 77, 100, 84, 90, 53, 114, 100, 112, 51, 87, 82, 107, 70, 43, 65, 61,
    ]);

    // Dependencies for node crypto service
    let telemetry: ProtonDriveTelemetry;
    let account: ProtonDriveAccount;
    let sharesService: SharesService;
    let nodesCryptoService: NodesCryptoService;

    beforeAll(async () => {
        CryptoApi.init({});
        cryptoProxy = new CryptoApi();

        openPGPCrypto = new OpenPGPCryptoWithCryptoProxy(cryptoProxy);
    });

    beforeEach(async () => {
        parentKey = await cryptoProxy.generateKey({
            userIDs: [{ name: 'Drive key' }],
            type: 'ecc',
            curve: 'ed25519Legacy',
        });
        addressKey = await cryptoProxy.generateKey({
            userIDs: [{ name: addressEmail }],
            type: 'ecc',
            curve: 'ed25519Legacy',
        });
        signingAddressKey = {
            type: 'userAddress',
            email: addressEmail,
            addressId: 'addressId',
            key: addressKey,
        };
        signingNodeKeys = {
            type: 'nodeKey',
            parentNodeKey: parentKey,
        };

        telemetry = getMockTelemetry();

        const srpModule = {
            getSrp: jest.fn(),
            getSrpVerifier: jest.fn(),
            computeKeyPassword: jest.fn(),
            generateKeySalt: jest.fn(),
        };
        const driveCrypto = new DriveCrypto(telemetry, openPGPCrypto, srpModule);

        // @ts-expect-error No need to implement all methods for mocking
        account = {
            getPublicKeys: jest.fn(async (email) => {
                if (email === addressEmail) {
                    return [addressKey];
                }
                return [];
            }),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {};

        const nodesCryptoReporter = new NodesCryptoReporter(telemetry, sharesService);
        nodesCryptoService = new NodesCryptoService(
            telemetry,
            driveCrypto,
            account,
            sharesService,
            nodesCryptoReporter,
        );
    });

    it('should encrypt and decrypt node folder', async () => {
        const name = 'new folder';
        const extendedAttributes = '{extendedAttributes}';

        // Encrypt node folder
        const encryptedNodeCrypto = await nodesCryptoService.createFolder(
            { key: parentKey, hashKey },
            signingAddressKey,
            name,
            extendedAttributes,
        );

        // Decrypt the encrypted node back
        const encryptedNode = makeEncryptedNodeFromFolderCrypto(encryptedNodeCrypto.encryptedCrypto);
        const { node: decryptedNode } = await nodesCryptoService.decryptNode(encryptedNode, parentKey);

        // Verify that the whole node is decrypted correctly
        verifyNodeFolder(decryptedNode, {
            name,
            hash: '758c29f021892c8180fc4c70777a39d312394f5bd1752502dba034980f82e91a',
            keyAuthor: addressEmail,
            nameAuthor: addressEmail,
            extendedAttributes,
        });
    });

    it('should encrypt and decrypt node anonymous folder', async () => {
        const name = 'new folder';
        const extendedAttributes = '{extendedAttributes}';

        // Encrypt node folder
        const encryptedNodeCrypto = await nodesCryptoService.createFolder(
            { key: parentKey, hashKey },
            signingNodeKeys,
            name,
            extendedAttributes,
        );

        // Decrypt the encrypted node back
        const encryptedNode = makeEncryptedNodeFromFolderCrypto(encryptedNodeCrypto.encryptedCrypto);
        const { node: decryptedNode } = await nodesCryptoService.decryptNode(encryptedNode, parentKey);

        // Verify that the whole node is decrypted correctly
        verifyNodeFolder(decryptedNode, {
            name,
            hash: '758c29f021892c8180fc4c70777a39d312394f5bd1752502dba034980f82e91a',
            keyAuthor: null,
            nameAuthor: null,
            extendedAttributes,
        });
    });

    it('should encrypt and decrypt new name', async () => {
        const extendedAttributes = '{extendedAttributes}';

        // Encrypt node folder
        const encryptedNodeCrypto = await nodesCryptoService.createFolder(
            { key: parentKey, hashKey },
            signingAddressKey,
            'new folder',
            extendedAttributes,
        );

        // Re-encrypt the name with the same name session key
        const encryptedNode = makeEncryptedNodeFromFolderCrypto(encryptedNodeCrypto.encryptedCrypto);
        const nameSessionKey = await nodesCryptoService.getNameSessionKey(encryptedNode, parentKey);
        const result = await nodesCryptoService.encryptNewName(
            { key: parentKey, hashKey },
            nameSessionKey,
            signingAddressKey,
            'changed name',
        );

        // Decrypt the encrypted node back
        const newEncryptedNode = {
            ...encryptedNode,
            encryptedName: result.armoredNodeName,
            hash: result.hash,
            encryptedCrypto: {
                ...encryptedNode.encryptedCrypto,
                nameSignatureEmail: result.signatureEmail,
            },
        };

        const { node: decryptedNode } = await nodesCryptoService.decryptNode(newEncryptedNode, parentKey);
        verifyNodeFolder(decryptedNode, {
            name: 'changed name',
            hash: '3b97d84974c61c722d2b2da26ba918cf910a1c8d101b0ca5914d2841d6aad12c',
            keyAuthor: addressEmail,
            nameAuthor: addressEmail,
            extendedAttributes,
        });

        // Verify the name can be decrypted with the original name session key
        const { data, verificationStatus } = await cryptoProxy.decryptMessage({
            armoredMessage: newEncryptedNode.encryptedName,
            sessionKeys: nameSessionKey,
            verificationKeys: [addressKey],
            format: 'binary',
        });
        const decryptedName = new TextDecoder('utf-8', { fatal: true }).decode(data);
        expect(decryptedName).toBe('changed name');
        expect(verificationStatus).toBe(VERIFICATION_STATUS.SIGNED_AND_VALID);
    });

    it('should encrypt anonymous folder, rename as logged in user, and decrypt new name', async () => {
        const extendedAttributes = '{extendedAttributes}';

        // Encrypt node folder
        const encryptedNodeCrypto = await nodesCryptoService.createFolder(
            { key: parentKey, hashKey },
            signingNodeKeys,
            'new folder',
            extendedAttributes,
        );

        // Re-encrypt the name with the same name session key
        const encryptedNode = makeEncryptedNodeFromFolderCrypto(encryptedNodeCrypto.encryptedCrypto);
        const nameSessionKey = await nodesCryptoService.getNameSessionKey(encryptedNode, parentKey);
        const result = await nodesCryptoService.encryptNewName(
            { key: parentKey, hashKey },
            nameSessionKey,
            signingAddressKey,
            'changed name',
        );

        // Decrypt the encrypted node back
        const newEncryptedNode = {
            ...encryptedNode,
            encryptedName: result.armoredNodeName,
            hash: result.hash,
            encryptedCrypto: {
                ...encryptedNode.encryptedCrypto,
                nameSignatureEmail: result.signatureEmail,
            },
        };

        const { node: decryptedNode } = await nodesCryptoService.decryptNode(newEncryptedNode, parentKey);

        verifyNodeFolder(decryptedNode, {
            name: 'changed name',
            hash: '3b97d84974c61c722d2b2da26ba918cf910a1c8d101b0ca5914d2841d6aad12c',
            keyAuthor: null,
            nameAuthor: 'test@proton.me',
            extendedAttributes,
        });

        // Verify the name can be decrypted with the original name session key
        const { data, verificationStatus } = await cryptoProxy.decryptMessage({
            armoredMessage: newEncryptedNode.encryptedName,
            sessionKeys: nameSessionKey,
            verificationKeys: signingAddressKey.type === 'userAddress' ? [signingAddressKey.key] : undefined,
            format: 'binary',
        });
        const decryptedName = new TextDecoder('utf-8', { fatal: true }).decode(data);
        expect(decryptedName).toBe('changed name');
        expect(verificationStatus).toBe(VERIFICATION_STATUS.SIGNED_AND_VALID);
    });

    it('should encrypt and decrypt moved node', async () => {
        const name = 'new folder';
        const extendedAttributes = '{extendedAttributes}';

        // Encrypt node folder
        const encryptedNodeCrypto = await nodesCryptoService.createFolder(
            { key: parentKey, hashKey },
            signingAddressKey,
            name,
            extendedAttributes,
        );

        // Re-encrypt the node with the same name session key and new parent key
        const newParentKey = await cryptoProxy.generateKey({
            userIDs: [{ name: 'Drive key' }],
            type: 'ecc',
            curve: 'ed25519Legacy',
        });

        const encryptedNode = makeEncryptedNodeFromFolderCrypto(encryptedNodeCrypto.encryptedCrypto);
        const nameSessionKey = await nodesCryptoService.getNameSessionKey(encryptedNode, parentKey);
        const result = await nodesCryptoService.encryptNodeWithNewParent(
            { ok: true, value: 'new folder' },
            {
                passphrase: encryptedNodeCrypto.keys.passphrase,
                passphraseSessionKey: encryptedNodeCrypto.keys.passphraseSessionKey,
                nameSessionKey,
            },
            { key: newParentKey, hashKey },
            signingAddressKey,
        );

        // Verify that the whole node is decrypted correctly
        const newEncryptedNode = {
            ...encryptedNode,
            encryptedName: result.encryptedName,
            hash: result.hash,
            encryptedCrypto: {
                ...encryptedNode.encryptedCrypto,
                armoredNodePassphrase: result.armoredNodePassphrase,
                armoredNodePassphraseSignature: result.armoredNodePassphraseSignature,
            },
        };
        const { node: decryptedNode } = await nodesCryptoService.decryptNode(newEncryptedNode, newParentKey);
        verifyNodeFolder(decryptedNode, {
            name,
            hash: '758c29f021892c8180fc4c70777a39d312394f5bd1752502dba034980f82e91a',
            keyAuthor: addressEmail,
            nameAuthor: addressEmail,
            extendedAttributes,
        });

        // Verify the name can be decrypted with the original name session key
        const { data } = await cryptoProxy.decryptMessage({
            armoredMessage: newEncryptedNode.encryptedName,
            sessionKeys: nameSessionKey,
            verificationKeys: [addressKey],
            format: 'binary',
        });
        const decryptedName = new TextDecoder('utf-8', { fatal: true }).decode(data);
        expect(decryptedName).toBe('new folder');
    });
});

function makeEncryptedNodeFromFolderCrypto(
    encryptedCrypto: EncryptedNodeFolderCrypto & { encryptedName: string; hash: string },
): EncryptedNode {
    return {
        hash: encryptedCrypto.hash,
        encryptedName: encryptedCrypto.encryptedName,

        uid: '123',
        type: NodeType.Folder,
        creationTime: new Date(),
        modificationTime: new Date(),
        isShared: false,
        isSharedPublicly: false,
        directRole: MemberRole.Admin,
        ownedBy: {
            email: 'test@proton.me',
        },

        encryptedCrypto: encryptedCrypto,
    };
}

function verifyNodeFolder(
    decryptedNode: DecryptedUnparsedNode,
    expected: {
        name: string;
        hash: string;
        keyAuthor: string | AnonymousUser;
        nameAuthor: string | AnonymousUser;
        extendedAttributes: string;
    },
) {
    verifyNode(decryptedNode, expected);
    expect(decryptedNode.folder?.extendedAttributes).toBe(expected.extendedAttributes);
}

function verifyNode(
    decryptedNode: DecryptedUnparsedNode,
    expected: {
        name: string;
        hash: string;
        keyAuthor: string | AnonymousUser;
        nameAuthor: string | AnonymousUser;
    },
) {
    expect(decryptedNode.name).toMatchObject({
        ok: true,
        value: expected.name,
    });
    expect(decryptedNode.hash).toBe(expected.hash);
    expect(decryptedNode.keyAuthor).toMatchObject({
        ok: true,
        value: expected.keyAuthor,
    });
    expect(decryptedNode.nameAuthor).toMatchObject({
        ok: true,
        value: expected.nameAuthor,
    });
    expect(decryptedNode.errors).toBe(undefined);
}
