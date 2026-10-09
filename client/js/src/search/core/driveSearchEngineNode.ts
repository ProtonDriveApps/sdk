import { wireErr, wireOk } from '@boltffi/runtime';

import type {
    Author,
    FfiAuthor,
    FfiNode,
    FfiNodeKind,
    FfiRevision,
    Node,
    NodeKind,
    Revision,
} from '../vendor/proton_drive_sdk_search.js';

/**
 * Builds the node the drive engines take from what the SDK client
 * describes (`FfiNode`), as `Node::new` of the search crate does
 * (`src/sdk/client/node_ffi.rs`).
 *
 * The bindings' own `Node.new` can't be used for a node handed back to the
 * engines: it decodes `Result` fields (name, authors) unwrapped, which boltffi
 * then can't encode again (an `Author` object is ambiguous with a result),
 * and it throws on their error branch. Here they stay wrapped in
 * `wireOk`/`wireErr`.
 *
 * TODO: use `Node.new` once boltffi round-trips records with `Result` fields.
 */
export function toNode(input: FfiNode): Node {
    return {
        creationTime: input.creationTime,
        directRole: input.directRole,
        errors: input.errors,
        // `isSharedByUrl` without `isShared` doesn't occur; it reads as URL-shared.
        shared: input.isSharedByUrl ? 2 : input.isShared ? 1 : 0, // WithUrl : WithUser : NotShared
        keyAuthor: toAuthorResult(input.keyAuthor),
        kind: toNodeKind(input.kind),
        directMembership: input.membership
            ? {
                  inviteTime: input.membership.inviteTime,
                  role: input.membership.role,
                  sharedBy: toAuthorResult(input.membership.sharedBy),
              }
            : null,
        modificationTime: input.modificationTime,
        name: input.nameError === null ? wireOk(input.name) : wireErr({ name: input.name, error: input.nameError }),
        nameAuthor: toAuthorResult(input.nameAuthor),
        owner: { email: input.ownerEmail, organization: input.ownerOrganization },
        parentUid: input.parentUid,
        trashTime: input.trashTime,
        treeEventScope: input.treeEventScope,
        uid: input.uid,
    } as Node;
}

function toNodeKind(kind: FfiNodeKind): NodeKind {
    switch (kind.tag) {
        case 'File':
        case 'Photo':
            return {
                tag: kind.tag,
                value0: {
                    mediaType: kind.value0.mediaType,
                    totalStorageSize: kind.value0.totalStorageSize,
                    activeRevision: toRevision(kind.value0.activeRevision),
                },
            };
        case 'Folder':
            return { tag: 'Folder', value0: kind.value0 };
        case 'Album':
            return { tag: 'Album' };
    }
}

function toRevision(revision: FfiRevision): Revision {
    return {
        claimedAdditionalMetadata: revision.claimedAdditionalMetadata,
        claimedDigests:
            revision.claimedSha1 === null
                ? null
                : { tag: revision.claimedSha1Verified ? 'Verified' : 'Unverified', value0: revision.claimedSha1 },
        claimedModificationTime: revision.claimedModificationTime,
        claimedSize: revision.claimedSize,
        contentAuthor: toAuthorResult(revision.contentAuthor),
        creationTime: revision.creationTime,
        imported: revision.isImported,
        state: revision.state,
        storageSize: revision.storageSize,
        uid: revision.uid,
    } as Revision;
}

/** No email is an anonymous author, or on the error branch an anonymous claim. */
function toAuthorResult({ email, verificationError }: FfiAuthor) {
    const author: Author = email === null ? { tag: 'Anonymous' } : { tag: 'Known', value0: email };
    return verificationError === null ? wireOk(author) : wireErr({ claimedAuthor: author, error: verificationError });
}
