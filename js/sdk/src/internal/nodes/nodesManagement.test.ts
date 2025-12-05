import { NodeAPIService } from './apiService';
import { NodesCryptoCache } from './cryptoCache';
import { NodesCryptoService } from './cryptoService';
import { NodesAccess } from './nodesAccess';
import { DecryptedNode } from './interface';
import { NodesManagement } from './nodesManagement';
import { NodeResult } from '../../interface';
import { NodeOutOfSyncError } from './errors';
import { ValidationError } from '../../errors';

describe('NodesManagement', () => {
    let apiService: NodeAPIService;
    let cryptoCache: NodesCryptoCache;
    let cryptoService: NodesCryptoService;
    let nodesAccess: NodesAccess;
    let management: NodesManagement;

    let nodes: { [uid: string]: DecryptedNode };

    beforeEach(() => {
        nodes = {
            nodeUid: {
                uid: 'nodeUid',
                parentUid: 'parentUid',
                name: { ok: true, value: 'old name' },
                keyAuthor: { ok: true, value: 'keyAauthor' },
                nameAuthor: { ok: true, value: 'nameAuthor' },
                hash: 'hash',
                mediaType: 'mediaType',
            } as DecryptedNode,
            anonymousNodeUid: {
                uid: 'anonymousNodeUid',
                parentUid: 'parentUid',
                name: { ok: true, value: 'old name' },
                keyAuthor: { ok: true, value: null },
                nameAuthor: { ok: true, value: 'nameAuthor' },
                hash: 'hash',
                mediaType: 'mediaType',
            } as DecryptedNode,
            parentUid: {
                uid: 'parentUid',
                name: { ok: true, value: 'parent' },
            } as DecryptedNode,
            newParentUid: {
                uid: 'newParentUid',
                name: { ok: true, value: 'new parent' },
            } as DecryptedNode,
        };

        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            renameNode: jest.fn(),
            moveNode: jest.fn(),
            copyNode: jest.fn().mockResolvedValue('newCopiedNodeUid'),
            trashNodes: jest.fn(async function* (uids) {
                yield* uids.map((uid) => ({ ok: true, uid }) as NodeResult);
            }),
            restoreNodes: jest.fn(async function* (uids) {
                yield* uids.map((uid) => ({ ok: true, uid }) as NodeResult);
            }),
            deleteTrashedNodes: jest.fn(async function* (uids) {
                yield* uids.map((uid) => ({ ok: true, uid }) as NodeResult);
            }),
            createFolder: jest.fn(),
            checkAvailableHashes: jest.fn().mockResolvedValue({
                availableHashes: ['name1Hash'],
                pendingHashes: [],
            }),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cryptoCache = {
            setNodeKeys: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            encryptNewName: jest.fn().mockResolvedValue({
                signatureEmail: 'newSignatureEmail',
                armoredNodeName: 'newArmoredNodeName',
                hash: 'newHash',
            }),
            encryptNodeWithNewParent: jest.fn(),
            createFolder: jest.fn(),
            generateNameHashes: jest.fn().mockResolvedValue([
                {
                    name: 'name1',
                    hash: 'name1Hash',
                },
                {
                    name: 'name2',
                    hash: 'name2Hash',
                },
                {
                    name: 'name3',
                    hash: 'name3Hash',
                },
            ]),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesAccess = {
            getNode: jest.fn().mockImplementation((uid: string) => nodes[uid]),
            getNodeKeys: jest.fn().mockImplementation((uid) => ({
                key: `${uid}-key`,
                hashKey: `${uid}-hashKey`,
                passphrase: `${uid}-passphrase`,
                passphraseSessionKey: `${uid}-passphraseSessionKey`,
            })),
            getParentKeys: jest.fn().mockImplementation(({ uid }) => ({
                key: `${nodes[uid].parentUid}-key`,
                hashKey: `${nodes[uid].parentUid}-hashKey`,
            })),
            iterateNodes: jest.fn(),
            getNodePrivateAndSessionKeys: jest.fn().mockImplementation((uid) =>
                Promise.resolve({
                    key: `${uid}-key`,
                    passphrase: `${uid}-passphrase`,
                    passphraseSessionKey: `${uid}-passphraseSessionKey`,
                    contentKeyPacketSessionKey: `${uid}-contentKeyPacketSessionKey`,
                    nameSessionKey: `${uid}-nameSessionKey`,
                }),
            ),
            getNodeSigningKeys: jest.fn().mockResolvedValue({
                type: 'userAddress',
                email: 'root-email',
                addressId: 'root-addressId',
                key: 'root-key',
            }),
            notifyNodeChanged: jest.fn(),
            notifyNodeDeleted: jest.fn(),
            notifyChildCreated: jest.fn(),
        };

        management = new NodesManagement(apiService, cryptoCache, cryptoService, nodesAccess);
    });

    it('renameNode manages rename and updates cache', async () => {
        const newNode = await management.renameNode('nodeUid', 'new name');

        expect(newNode).toEqual({
            ...nodes.nodeUid,
            name: { ok: true, value: 'new name' },
            encryptedName: 'newArmoredNodeName',
            nameAuthor: { ok: true, value: 'newSignatureEmail' },
            hash: 'newHash',
        });
        expect(nodesAccess.getNodeSigningKeys).toHaveBeenCalledWith({ nodeUid: 'nodeUid', parentNodeUid: 'parentUid' });
        expect(cryptoService.encryptNewName).toHaveBeenCalledWith(
            { key: 'parentUid-key', hashKey: 'parentUid-hashKey' },
            'nodeUid-nameSessionKey',
            { type: 'userAddress', email: 'root-email', addressId: 'root-addressId', key: 'root-key' },
            'new name',
        );
        expect(apiService.renameNode).toHaveBeenCalledWith(
            nodes.nodeUid.uid,
            { hash: nodes.nodeUid.hash },
            { encryptedName: 'newArmoredNodeName', nameSignatureEmail: 'newSignatureEmail', hash: 'newHash' },
        );
        expect(nodesAccess.notifyNodeChanged).toHaveBeenCalledWith('nodeUid');
    });

    it('renameNode refreshes cache if node is out of sync', async () => {
        const error = new NodeOutOfSyncError('Node is out of sync');
        apiService.renameNode = jest.fn().mockRejectedValue(error);

        await expect(management.renameNode('nodeUid', 'new name')).rejects.toThrow(error);

        expect(nodesAccess.notifyNodeChanged).toHaveBeenCalledWith('nodeUid');
    });

    it('moveNode manages move and updates cache', async () => {
        const encryptedCrypto = {
            encryptedName: 'movedArmoredNodeName',
            hash: 'movedHash',
            armoredNodePassphrase: 'movedArmoredNodePassphrase',
            armoredNodePassphraseSignature: 'movedArmoredNodePassphraseSignature',
            signatureEmail: 'movedSignatureEmail',
            nameSignatureEmail: 'movedNameSignatureEmail',
        };
        cryptoService.encryptNodeWithNewParent = jest.fn().mockResolvedValue(encryptedCrypto);

        const newNode = await management.moveNode('nodeUid', 'newParentNodeUid');

        expect(newNode).toEqual({
            ...nodes.nodeUid,
            parentUid: 'newParentNodeUid',
            encryptedName: 'movedArmoredNodeName',
            hash: 'movedHash',
            keyAuthor: { ok: true, value: 'movedSignatureEmail' },
            nameAuthor: { ok: true, value: 'movedNameSignatureEmail' },
        });
        expect(nodesAccess.getNodeSigningKeys).toHaveBeenCalledWith({
            nodeUid: 'nodeUid',
            parentNodeUid: 'newParentNodeUid',
        });
        expect(cryptoService.encryptNodeWithNewParent).toHaveBeenCalledWith(
            nodes.nodeUid.name,
            expect.objectContaining({
                key: 'nodeUid-key',
                passphrase: 'nodeUid-passphrase',
                passphraseSessionKey: 'nodeUid-passphraseSessionKey',
                contentKeyPacketSessionKey: 'nodeUid-contentKeyPacketSessionKey',
                nameSessionKey: 'nodeUid-nameSessionKey',
            }),
            expect.objectContaining({ key: 'newParentNodeUid-key', hashKey: 'newParentNodeUid-hashKey' }),
            { type: 'userAddress', email: 'root-email', addressId: 'root-addressId', key: 'root-key' },
        );
        expect(apiService.moveNode).toHaveBeenCalledWith(
            'nodeUid',
            {
                hash: nodes.nodeUid.hash,
            },
            {
                parentUid: 'newParentNodeUid',
                ...encryptedCrypto,
                armoredNodePassphraseSignature: undefined,
                signatureEmail: undefined,
            },
        );
        expect(nodesAccess.notifyNodeChanged).toHaveBeenCalledWith('nodeUid', 'newParentNodeUid');
    });

    it('moveNode manages move of anonymous node', async () => {
        const encryptedCrypto = {
            encryptedName: 'movedArmoredNodeName',
            hash: 'movedHash',
            armoredNodePassphrase: 'movedArmoredNodePassphrase',
            armoredNodePassphraseSignature: 'movedArmoredNodePassphraseSignature',
            signatureEmail: 'movedSignatureEmail',
            nameSignatureEmail: 'movedNameSignatureEmail',
        };
        cryptoService.encryptNodeWithNewParent = jest.fn().mockResolvedValue(encryptedCrypto);

        const newNode = await management.moveNode('anonymousNodeUid', 'newParentNodeUid');

        expect(cryptoService.encryptNodeWithNewParent).toHaveBeenCalledWith(
            nodes.anonymousNodeUid.name,
            expect.objectContaining({
                key: 'anonymousNodeUid-key',
                passphrase: 'anonymousNodeUid-passphrase',
                passphraseSessionKey: 'anonymousNodeUid-passphraseSessionKey',
                contentKeyPacketSessionKey: 'anonymousNodeUid-contentKeyPacketSessionKey',
                nameSessionKey: 'anonymousNodeUid-nameSessionKey',
            }),
            expect.objectContaining({ key: 'newParentNodeUid-key', hashKey: 'newParentNodeUid-hashKey' }),
            { type: 'userAddress', email: 'root-email', addressId: 'root-addressId', key: 'root-key' },
        );
        expect(newNode).toEqual({
            ...nodes.anonymousNodeUid,
            parentUid: 'newParentNodeUid',
            encryptedName: 'movedArmoredNodeName',
            hash: 'movedHash',
            keyAuthor: { ok: true, value: 'movedSignatureEmail' },
            nameAuthor: { ok: true, value: 'movedNameSignatureEmail' },
        });
        expect(apiService.moveNode).toHaveBeenCalledWith(
            'anonymousNodeUid',
            {
                hash: nodes.nodeUid.hash,
            },
            {
                parentUid: 'newParentNodeUid',
                ...encryptedCrypto,
            },
        );
    });

    it('copyNode manages copy and updates cache', async () => {
        const encryptedCrypto = {
            encryptedName: 'copiedArmoredNodeName',
            hash: 'copiedHash',
            armoredNodePassphrase: 'copiedArmoredNodePassphrase',
            armoredNodePassphraseSignature: 'copiedArmoredNodePassphraseSignature',
            signatureEmail: 'copiedSignatureEmail',
            nameSignatureEmail: 'copiedNameSignatureEmail',
        };
        cryptoService.encryptNodeWithNewParent = jest.fn().mockResolvedValue(encryptedCrypto);

        const newNode = await management.copyNode('nodeUid', 'newParentNodeUid');

        expect(newNode).toEqual({
            ...nodes.nodeUid,
            uid: 'newCopiedNodeUid',
            parentUid: 'newParentNodeUid',
            encryptedName: 'copiedArmoredNodeName',
            hash: 'copiedHash',
            keyAuthor: { ok: true, value: 'copiedSignatureEmail' },
            nameAuthor: { ok: true, value: 'copiedNameSignatureEmail' },
        });
        expect(nodesAccess.getNodeSigningKeys).toHaveBeenCalledWith({
            nodeUid: 'nodeUid',
            parentNodeUid: 'newParentNodeUid',
        });
        expect(cryptoService.encryptNodeWithNewParent).toHaveBeenCalledWith(
            nodes.nodeUid.name,
            expect.objectContaining({
                key: 'nodeUid-key',
                passphrase: 'nodeUid-passphrase',
                passphraseSessionKey: 'nodeUid-passphraseSessionKey',
                contentKeyPacketSessionKey: 'nodeUid-contentKeyPacketSessionKey',
                nameSessionKey: 'nodeUid-nameSessionKey',
            }),
            expect.objectContaining({ key: 'newParentNodeUid-key', hashKey: 'newParentNodeUid-hashKey' }),
            { type: 'userAddress', email: 'root-email', addressId: 'root-addressId', key: 'root-key' },
        );
        expect(apiService.copyNode).toHaveBeenCalledWith('nodeUid', {
            parentUid: 'newParentNodeUid',
            ...encryptedCrypto,
            armoredNodePassphraseSignature: undefined,
            signatureEmail: undefined,
        });
        expect(nodesAccess.notifyNodeChanged).not.toHaveBeenCalledWith();
        expect(nodesAccess.notifyChildCreated).toHaveBeenCalledWith('newParentNodeUid');
    });

    it('copyNode manages copy of anonymous node', async () => {
        const encryptedCrypto = {
            encryptedName: 'copiedArmoredNodeName',
            hash: 'copiedHash',
            armoredNodePassphrase: 'copiedArmoredNodePassphrase',
            armoredNodePassphraseSignature: 'copiedArmoredNodePassphraseSignature',
            signatureEmail: 'copiedSignatureEmail',
            nameSignatureEmail: 'copiedNameSignatureEmail',
        };
        cryptoService.encryptNodeWithNewParent = jest.fn().mockResolvedValue(encryptedCrypto);

        const newNode = await management.copyNode('anonymousNodeUid', 'newParentNodeUid');

        expect(cryptoService.encryptNodeWithNewParent).toHaveBeenCalledWith(
            nodes.anonymousNodeUid.name,
            expect.objectContaining({
                key: 'anonymousNodeUid-key',
                passphrase: 'anonymousNodeUid-passphrase',
                passphraseSessionKey: 'anonymousNodeUid-passphraseSessionKey',
                contentKeyPacketSessionKey: 'anonymousNodeUid-contentKeyPacketSessionKey',
                nameSessionKey: 'anonymousNodeUid-nameSessionKey',
            }),
            expect.objectContaining({ key: 'newParentNodeUid-key', hashKey: 'newParentNodeUid-hashKey' }),
            { type: 'userAddress', email: 'root-email', addressId: 'root-addressId', key: 'root-key' },
        );
        expect(newNode).toEqual({
            ...nodes.anonymousNodeUid,
            uid: 'newCopiedNodeUid',
            parentUid: 'newParentNodeUid',
            encryptedName: 'copiedArmoredNodeName',
            hash: 'copiedHash',
            keyAuthor: { ok: true, value: 'copiedSignatureEmail' },
            nameAuthor: { ok: true, value: 'copiedNameSignatureEmail' },
        });
        expect(apiService.copyNode).toHaveBeenCalledWith('anonymousNodeUid', {
            parentUid: 'newParentNodeUid',
            ...encryptedCrypto,
        });
    });

    it('copyNode manages copy of node with new name', async () => {
        const encryptedCrypto = {
            encryptedName: 'copiedArmoredNodeName',
            hash: 'copiedHash',
            armoredNodePassphrase: 'copiedArmoredNodePassphrase',
            armoredNodePassphraseSignature: 'copiedArmoredNodePassphraseSignature',
            signatureEmail: 'copiedSignatureEmail',
            nameSignatureEmail: 'copiedNameSignatureEmail',
        };
        cryptoService.encryptNodeWithNewParent = jest.fn().mockResolvedValue(encryptedCrypto);

        const newName = 'new name';
        const newNode = await management.copyNode('nodeUid', 'newParentNodeUid', newName);

        expect(newNode).toEqual({
            ...nodes.nodeUid,
            name: { ok: true, value: newName },
            uid: 'newCopiedNodeUid',
            parentUid: 'newParentNodeUid',
            encryptedName: 'copiedArmoredNodeName',
            hash: 'copiedHash',
            keyAuthor: { ok: true, value: 'copiedSignatureEmail' },
            nameAuthor: { ok: true, value: 'copiedNameSignatureEmail' },
        });
        expect(cryptoService.encryptNodeWithNewParent).toHaveBeenCalledWith(
            { ok: true, value: newName },
            expect.objectContaining({
                key: 'nodeUid-key',
                passphrase: 'nodeUid-passphrase',
                passphraseSessionKey: 'nodeUid-passphraseSessionKey',
                contentKeyPacketSessionKey: 'nodeUid-contentKeyPacketSessionKey',
                nameSessionKey: 'nodeUid-nameSessionKey',
            }),
            expect.objectContaining({ key: 'newParentNodeUid-key', hashKey: 'newParentNodeUid-hashKey' }),
            { type: 'userAddress', email: 'root-email', addressId: 'root-addressId', key: 'root-key' },
        );
    });

    it('copyNode throws error if name is invalid', async () => {
        const promise = management.copyNode('nodeUid', 'newParentNodeUid', 'invalid/name');
        await expect(promise).rejects.toThrow(ValidationError);
    });

    it('trashes node and updates cache', async () => {
        const uids = ['v1~n1', 'v1~n2'];
        const trashed = new Set();
        for await (const node of management.trashNodes(uids)) {
            trashed.add(node.uid);
        }
        expect(trashed).toEqual(new Set(uids));
        expect(nodesAccess.notifyNodeChanged).toHaveBeenCalledTimes(2);
    });

    it('restores node and updates cache', async () => {
        const uids = ['v1~n1', 'v1~n2'];
        const restored = new Set();
        for await (const node of management.restoreNodes(uids)) {
            restored.add(node.uid);
        }
        expect(restored).toEqual(new Set(uids));
        expect(nodesAccess.notifyNodeChanged).toHaveBeenCalledTimes(2);
    });

    describe('findAvailableName', () => {
        it('should find available name', async () => {
            apiService.checkAvailableHashes = jest.fn().mockImplementation(() => {
                return {
                    availableHashes: ['name3Hash'],
                    pendingHashes: [],
                };
            });

            const result = await management.findAvailableName('parentUid', 'name');
            expect(result).toBe('name3');
            expect(apiService.checkAvailableHashes).toHaveBeenCalledTimes(1);
            expect(apiService.checkAvailableHashes).toHaveBeenCalledWith('parentUid', [
                'name1Hash',
                'name2Hash',
                'name3Hash',
            ]);
        });

        it('should find available name with multiple pages', async () => {
            let firstCall = false;
            apiService.checkAvailableHashes = jest.fn().mockImplementation(() => {
                if (!firstCall) {
                    firstCall = true;
                    return {
                        // First page has no available hashes
                        availableHashes: [],
                        pendingHashes: [],
                    };
                }
                return {
                    availableHashes: ['name3Hash'],
                    pendingHashes: [],
                };
            });

            const result = await management.findAvailableName('parentUid', 'name');
            expect(result).toBe('name3');
            expect(apiService.checkAvailableHashes).toHaveBeenCalledTimes(2);
            expect(apiService.checkAvailableHashes).toHaveBeenCalledWith('parentUid', [
                'name1Hash',
                'name2Hash',
                'name3Hash',
            ]);
        });
    });
});
