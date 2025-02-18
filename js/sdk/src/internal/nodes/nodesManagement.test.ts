import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache"
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { NodesAccess } from './nodesAccess';
import { DecryptedNode } from './interface';
import { NodesManagement } from './nodesManagement';

describe('NodesManagement', () => {
    let apiService: NodeAPIService;
    let cache: NodesCache;
    let cryptoCache: NodesCryptoCache;
    let cryptoService: NodesCryptoService;
    let nodesAccess: NodesAccess;
    let management: NodesManagement;

    const nodes: { [uid: string]: DecryptedNode } = {
        nodeUid: {
            uid: 'nodeUid',
            parentUid: 'parentUid',
            name: { ok: true, value: 'old name' },
            keyAuthor: { ok: true, value: 'keyAauthor' },
            nameAuthor: { ok: true, value: 'nameAuthor' },
            hash: 'hash',
            mimeType: 'mimeType',
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

    beforeEach(() => {
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
        cache = {
            setNode: jest.fn(),
            removeNodes: jest.fn(),
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
            })),
            getParentKeys: jest.fn().mockImplementation(({ uid }) => ({
                key: `${nodes[uid].parentUid}-key`,
                hashKey: `${nodes[uid].parentUid}-hashKey`,
            })),
            iterateNodes: jest.fn(),
        }

        management = new NodesManagement(apiService, cache, cryptoCache, cryptoService, nodesAccess);
    });

    it('renameNode manages rename and updates cache', async () => {
        const newNode = await management.renameNode('nodeUid', 'new name');
        expect(newNode).toEqual({
            ...nodes.nodeUid,
            name: { ok: true, value: 'new name' },
            nameAuthor: { ok: true, value: 'newSignatureEmail' },
            hash: 'newHash',
        });
        expect(cryptoService.encryptNewName).toHaveBeenCalledWith(nodes.nodeUid, {
            key: 'parentUid-key',
            hashKey: 'parentUid-hashKey',
        }, 'new name');
        expect(apiService.renameNode).toHaveBeenCalledWith(
            nodes.nodeUid.uid,
            { hash: nodes.nodeUid.hash },
            { encryptedName: 'newArmoredNodeName', nameSignatureEmail: 'newSignatureEmail', hash: 'newHash' }
        );
        expect(cache.setNode).toHaveBeenCalledWith(newNode);
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
        expect(apiService.moveNode).toHaveBeenCalledWith(
            'nodeUid',
            {
                hash: nodes.nodeUid.hash,
            },
            {
                parentUid: 'newParentNodeUid',
                ...encryptedCrypto
            },
        );
        expect(cache.setNode).toHaveBeenCalledWith(newNode);
    });
});
