import { resultError, resultOk } from '../interface';
import { MemberRole, type NodeEntity, NodeType, RevisionState } from '../interface/nodes';
import { SearchSdkCapabilitiesAdapter, toFfiNode } from './sdkCapabilities';

const DATE = new Date('2024-01-01T00:00:00Z');
const SECONDS = BigInt(DATE.getTime() / 1000);

function folder(overrides: Partial<NodeEntity> = {}): NodeEntity {
    return {
        uid: 'volume~folder',
        parentUid: 'volume~root',
        name: resultOk('Documents'),
        keyAuthor: resultOk('owner@proton.me'),
        nameAuthor: resultOk('owner@proton.me'),
        directRole: MemberRole.Admin,
        ownedBy: { email: 'owner@proton.me' },
        type: NodeType.Folder,
        isShared: false,
        isSharedByUrl: false,
        creationTime: DATE,
        modificationTime: DATE,
        treeEventScopeId: 'volume',
        ...overrides,
    };
}

function file(overrides: Partial<NodeEntity> = {}): NodeEntity {
    return folder({
        uid: 'volume~file',
        name: resultOk('invoice.pdf'),
        type: NodeType.File,
        mediaType: 'application/pdf',
        totalStorageSize: 2048,
        activeRevision: {
            uid: 'revision',
            state: RevisionState.Active,
            creationTime: DATE,
            contentAuthor: resultOk('owner@proton.me'),
            storageSize: 2048,
            isImported: false,
            claimedSize: 1024,
            claimedDigests: { sha1: 'abc', sha1Verified: true },
        },
        ...overrides,
    });
}

describe('toFfiNode', () => {
    it('maps a folder', () => {
        expect(toFfiNode(folder())).toEqual({
            uid: { volumeId: 'volume', nodeId: 'folder' },
            parentUid: { volumeId: 'volume', nodeId: 'root' },
            treeEventScope: 'volume',
            kind: { tag: 'Folder', value0: { claimedModificationTime: null, isImported: false } },
            name: 'Documents',
            nameError: null,
            nameAuthor: { email: 'owner@proton.me', verificationError: null },
            keyAuthor: { email: 'owner@proton.me', verificationError: null },
            directRole: 3,
            membership: null,
            ownerEmail: 'owner@proton.me',
            ownerOrganization: null,
            isShared: false,
            isSharedByUrl: false,
            creationTime: SECONDS,
            modificationTime: SECONDS,
            trashTime: null,
            errors: [],
        });
    });

    it('maps a file with its active revision', () => {
        expect(toFfiNode(file())?.kind).toEqual({
            tag: 'File',
            value0: {
                mediaType: 'application/pdf',
                totalStorageSize: 2048n,
                activeRevision: {
                    uid: 'revision',
                    state: 0,
                    creationTime: SECONDS,
                    contentAuthor: { email: 'owner@proton.me', verificationError: null },
                    storageSize: 2048n,
                    isImported: false,
                    claimedSize: 1024n,
                    claimedModificationTime: null,
                    claimedSha1: 'abc',
                    claimedSha1Verified: true,
                    claimedAdditionalMetadata: null,
                },
            },
        });
    });

    it('leaves out a file without an active revision', () => {
        expect(toFfiNode(file({ activeRevision: undefined }))).toBeUndefined();
    });

    it('passes the placeholder of an invalid name with its error', () => {
        const node = folder({ name: resultError({ name: 'placeholder', error: 'invalid' }) });

        expect(toFfiNode(node)).toMatchObject({ name: 'placeholder', nameError: 'invalid' });
    });

    it('passes no name for an undecryptable one', () => {
        const node = folder({ name: resultError(new Error('decryption failed')) });

        expect(toFfiNode(node)).toMatchObject({ name: '', nameError: 'decryption failed' });
    });

    it('passes the claimed author of an unverified one with the error', () => {
        const node = folder({
            nameAuthor: resultError({ claimedAuthor: 'claimed@proton.me', error: 'bad signature' }),
        });

        expect(toFfiNode(node)?.nameAuthor).toEqual({
            email: 'claimed@proton.me',
            verificationError: 'bad signature',
        });
    });
});

describe('SearchSdkCapabilitiesAdapter', () => {
    it('loads the nodes, leaving out the missing ones', async () => {
        const capabilities = new SearchSdkCapabilitiesAdapter(
            async function* () {
                yield folder();
                yield { missingUid: 'volume~gone' };
            },
            { get: jest.fn(), post: jest.fn(), put: jest.fn() },
        );

        const nodes = await capabilities.loadNodes(['volume~folder', 'volume~gone']);

        expect(nodes.map((node) => node.uid.nodeId)).toEqual(['folder']);
    });

    it('calls the Drive API with the method asked', async () => {
        const apiService = { get: jest.fn(), post: jest.fn().mockResolvedValue({ Code: 1000 }), put: jest.fn() };
        const capabilities = new SearchSdkCapabilitiesAdapter(async function* () {}, apiService);

        expect(await capabilities.apiRequest('POST', 'drive/search/extraction-queue', { Limit: 1 })).toEqual({
            Code: 1000,
        });
        expect(apiService.post).toHaveBeenCalledWith('drive/search/extraction-queue', { Limit: 1 });
    });
});
