import { MemberRole, NodeEntity, NodeType } from '@protontech/drive-sdk';

import { serializeNodeName } from './transferManifest';

function mockFileNode(overrides: Partial<NodeEntity> = {}): NodeEntity {
    return {
        uid: 'volumeId~nodeId',
        name: { ok: true, value: 'notes.txt' },
        keyAuthor: { ok: true, value: 'alice@example.com' },
        nameAuthor: { ok: true, value: 'bob@example.com' },
        directRole: MemberRole.Admin,
        ownedBy: { email: 'alice@example.com' },
        type: NodeType.File,
        isShared: false,
        isSharedByUrl: false,
        creationTime: new Date('2024-01-01T00:00:00.000Z'),
        modificationTime: new Date('2024-01-02T00:00:00.000Z'),
        treeEventScopeId: 'scope',
        ...overrides,
    };
}

describe('serializeNodeName', () => {
    it('keeps the decrypted name', () => {
        expect(serializeNodeName(mockFileNode())).toEqual({ originalName: 'notes.txt' });
    });

    it('reports a name that could not be decrypted', () => {
        const node = mockFileNode({ name: { ok: false, error: new Error('Cannot decrypt') } });

        expect(serializeNodeName(node)).toEqual({
            originalName: null,
            error: 'Error: Cannot decrypt',
        });
    });

    it('reports a name with invalid characters', () => {
        const node = mockFileNode({
            name: { ok: false, error: { name: 'placeholder', error: 'Name contains invalid characters' } },
        });

        expect(serializeNodeName(node)).toEqual({
            originalName: null,
            error: 'Name contains invalid characters',
        });
    });
});
