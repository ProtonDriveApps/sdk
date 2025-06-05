import { NodeAPIService } from "./apiService";
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { NodesAccess } from './nodesAccess';
import { NodesEvents } from './events';
import { DecryptedNode } from './interface';
import { NodesManagement } from './nodesManagement';

describe('NodesManagement', () => {
    let apiService: NodeAPIService;
    let cryptoCache: NodesCryptoCache;
    let cryptoService: NodesCryptoService;
    let nodesAccess: NodesAccess;
    let nodesEvents: NodesEvents;
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
            trashNodes: jest.fn(),
            restoreNodes: jest.fn(),
            deleteNodes: jest.fn(),
            createFolder: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoCache = {
            setNodeKeys: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            encryptNewName: jest.fn().mockResolvedValue({
                signatureEmail: 'newSignatureEmail',
                armoredNodeName: 'newArmoredNodeName',
                hash: 'newHash',
            }),
            moveNode: jest.fn(),
            createFolder: jest.fn(),
        }
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
            getNodePrivateAndSessionKeys: jest.fn().mockResolvedValue({
                nameSessionKey: 'nameSessionKey',
            }),
            getRootNodeEmailKey: jest.fn().mockResolvedValue({ email: "root-email", addressKey: "root-key" }),
        }
        // @ts-expect-error No need to implement all methods for mocking
        nodesEvents = {
            nodeCreated: jest.fn(),
            nodeUpdated: jest.fn(),
            nodesDeleted: jest.fn(),
        }

        management = new NodesManagement(apiService, cryptoCache, cryptoService, nodesAccess, nodesEvents);
    });

    it('renameNode manages rename and updates cache', async () => {
        const newNode = await management.renameNode('nodeUid', 'new name');

        expect(newNode).toEqual({
            ...nodes.nodeUid,
            name: { ok: true, value: 'new name' },
            nameAuthor: { ok: true, value: 'newSignatureEmail' },
            hash: 'newHash',
        });
        expect(nodesAccess.getRootNodeEmailKey).toHaveBeenCalledWith('nodeUid');
        expect(cryptoService.encryptNewName).toHaveBeenCalledWith(
            'nameSessionKey',
            { email: "root-email", addressKey: "root-key" },
            'parentUid-hashKey',
            'new name',
        );
        expect(apiService.renameNode).toHaveBeenCalledWith(
            nodes.nodeUid.uid,
            { hash: nodes.nodeUid.hash },
            { encryptedName: 'newArmoredNodeName', nameSignatureEmail: 'newSignatureEmail', hash: 'newHash' }
        );
        expect(nodesEvents.nodeUpdated).toHaveBeenCalledWith(newNode);
    });

    it('moveNode manages move and updates cache', async () => {
        const encryptedCrypto = {
            encryptedName: 'movedArmoredNodeName',
            hash: 'movedHash',
            armoredNodePassphrase: 'movedArmoredNodePassphrase',
            armoredNodePassphraseSignature: 'movedArmoredNodePassphraseSignature',
            signatureEmail: 'movedSignatureEmail',
            nameSignatureEmail: 'movedNameSignatureEmail',
        }
        cryptoService.moveNode = jest.fn().mockResolvedValue(encryptedCrypto);

        const newNode = await management.moveNode('nodeUid', 'newParentNodeUid');

        expect(newNode).toEqual({
            ...nodes.nodeUid,
            parentUid: 'newParentNodeUid',
            hash: 'movedHash',
            keyAuthor: { ok: true, value: 'movedSignatureEmail' },
            nameAuthor: { ok: true, value: 'movedNameSignatureEmail' },
        });
        expect(nodesAccess.getRootNodeEmailKey).toHaveBeenCalledWith('newParentNodeUid');
        expect(cryptoService.moveNode).toHaveBeenCalledWith(
            nodes.nodeUid,
            expect.objectContaining({ passphrase: 'nodeUid-passphrase', passphraseSessionKey: 'nodeUid-passphraseSessionKey' }),
            expect.objectContaining({ key: 'newParentNodeUid-key', hashKey: 'newParentNodeUid-hashKey' }),
            { email: "root-email", addressKey: "root-key" },
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
        expect(nodesEvents.nodeUpdated).toHaveBeenCalledWith(newNode);
    });

    it('moveNode manages move of anonymous node', async () => {
        const encryptedCrypto = {
            encryptedName: 'movedArmoredNodeName',
            hash: 'movedHash',
            armoredNodePassphrase: 'movedArmoredNodePassphrase',
            armoredNodePassphraseSignature: 'movedArmoredNodePassphraseSignature',
            signatureEmail: 'movedSignatureEmail',
            nameSignatureEmail: 'movedNameSignatureEmail',
        }
        cryptoService.moveNode = jest.fn().mockResolvedValue(encryptedCrypto);

        const newNode = await management.moveNode('anonymousNodeUid', 'newParentNodeUid');
        expect(newNode).toEqual({
            ...nodes.anonymousNodeUid,
            parentUid: 'newParentNodeUid',
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
                ...encryptedCrypto
            },
        );
        expect(nodesEvents.nodeUpdated).toHaveBeenCalledWith(newNode);
    });
});
