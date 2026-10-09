import { wireErr, wireOk } from '@boltffi/runtime';

import type { FfiNode } from '../vendor/proton_drive_sdk_search.js';
import { toNode } from './driveSearchEngineNode';

const author = (email: string | null, verificationError: string | null = null) => ({ email, verificationError });

function ffiNode(overrides: Partial<FfiNode> = {}): FfiNode {
    return {
        uid: { volumeId: 'volume', nodeId: 'file' },
        parentUid: null,
        treeEventScope: 'volume',
        kind: {
            tag: 'File',
            value0: {
                mediaType: 'text/plain',
                totalStorageSize: 10n,
                activeRevision: {
                    uid: 'revision',
                    state: 0,
                    creationTime: 1n,
                    contentAuthor: author('owner@proton.me'),
                    storageSize: 10n,
                    isImported: false,
                    claimedSize: 5n,
                    claimedModificationTime: null,
                    claimedSha1: 'abc',
                    claimedSha1Verified: true,
                    claimedAdditionalMetadata: null,
                },
            },
        },
        name: 'file.txt',
        nameError: null,
        nameAuthor: author('owner@proton.me'),
        keyAuthor: author(null),
        directRole: 0,
        membership: null,
        ownerEmail: 'owner@proton.me',
        ownerOrganization: null,
        isShared: true,
        isSharedByUrl: false,
        creationTime: 1n,
        modificationTime: 2n,
        trashTime: null,
        errors: [],
        ...overrides,
    } as FfiNode;
}

describe('toNode', () => {
    it('keeps results wrapped, so the bindings can encode the node again', () => {
        const node = toNode(ffiNode());

        expect(node.name).toEqual(wireOk('file.txt'));
        expect(node.nameAuthor).toEqual(wireOk({ tag: 'Known', value0: 'owner@proton.me' }));
        expect(node.keyAuthor).toEqual(wireOk({ tag: 'Anonymous' }));
        expect(node.shared).toBe(1);
        expect(node.owner).toEqual({ email: 'owner@proton.me', organization: null });
    });

    it('maps the active revision', () => {
        const { kind } = toNode(ffiNode());

        expect(kind.tag === 'File' && kind.value0.activeRevision).toMatchObject({
            claimedDigests: { tag: 'Verified', value0: 'abc' },
            contentAuthor: wireOk({ tag: 'Known', value0: 'owner@proton.me' }),
            imported: false,
        });
    });

    it('passes an invalid name and an unverified author as errors', () => {
        const node = toNode(
            ffiNode({
                name: 'placeholder',
                nameError: 'invalid',
                nameAuthor: author('claimed@proton.me', 'bad signature'),
            }),
        );

        expect(node.name).toEqual(wireErr({ name: 'placeholder', error: 'invalid' }));
        expect(node.nameAuthor).toEqual(
            wireErr({ claimedAuthor: { tag: 'Known', value0: 'claimed@proton.me' }, error: 'bad signature' }),
        );
    });
});
