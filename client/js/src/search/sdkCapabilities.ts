import type { Author } from '../interface/author';
import {
    type MaybeMissingNode,
    MemberRole,
    type NodeEntity,
    NodeType,
    type Revision,
    RevisionState,
} from '../interface/nodes';
import { splitNodeUid } from '../internal/uids';
import type {
    FfiAuthor,
    FfiNode,
    FfiNodeKind,
    FfiRevision,
    MemberRole as FfiMemberRole,
    RevisionState as FfiRevisionState,
} from './vendor/proton_drive_sdk_search.js';

/**
 * What the search module needs from the SDK client, which only the
 * application's thread holds: the nodes, and the authenticated Drive API.
 *
 * Plain data in and out, so the same object serves a module in the same
 * thread and one in a worker (over Comlink).
 */
export interface SearchSdkCapabilities {
    /** Nodes for the UIDs, shaped for the module; missing ones are left out. */
    loadNodes(nodeUids: string[]): Promise<FfiNode[]>;
    /**
     * Calls the Drive API, through the SDK client's API service (session,
     * headers, error codes, retries), with a path relative to its base URL.
     *
     * In the browser the search module runs in a worker, and this method runs
     * in the tab, which holds the session: the worker calls it through a
     * Comlink proxy. Hence plain JSON in and out, and a rejected promise on
     * failure: they pass between threads unchanged.
     *
     * The module's `HttpClient` (bytes, boltffi error values) is adapted to
     * this on the worker side, by `SdkHttpClient`, so the SDK client never
     * depends on the search bindings.
     *
     * @throws When the request fails or the API answers with an error code.
     */
    apiRequest(method: SearchApiMethod, path: string, json?: object): Promise<object>;
}

export type SearchApiMethod = 'GET' | 'POST' | 'PUT';

/** The subset of the internal Drive API service the search module calls. */
export interface SearchApiService {
    get<T>(url: string): Promise<T>;
    post<Req, T>(url: string, data?: Req): Promise<T>;
    put<Req, T>(url: string, data: Req): Promise<T>;
}

/**
 * The SDK client's side of {@link SearchSdkCapabilities}: its nodes and its
 * Drive API service.
 */
export class SearchSdkCapabilitiesAdapter implements SearchSdkCapabilities {
    constructor(
        private iterateNodes: (nodeUids: string[]) => AsyncIterable<MaybeMissingNode>,
        private apiService: SearchApiService,
    ) {
        this.iterateNodes = iterateNodes;
        this.apiService = apiService;
    }

    async loadNodes(nodeUids: string[]): Promise<FfiNode[]> {
        const nodes: FfiNode[] = [];
        for await (const node of this.iterateNodes(nodeUids)) {
            const ffiNode = 'missingUid' in node ? undefined : toFfiNode(node);
            if (ffiNode) {
                nodes.push(ffiNode);
            }
        }
        return nodes;
    }

    async apiRequest(method: SearchApiMethod, path: string, json?: object): Promise<object> {
        if (!path.startsWith('drive/search/')) {
            throw new Error(`Search may not call ${path}`);
        }
        switch (method) {
            case 'GET':
                return this.apiService.get<object>(path);
            case 'POST':
                return this.apiService.post<object | undefined, object>(path, json);
            case 'PUT':
                return this.apiService.put<object | undefined, object>(path, json);
        }
    }
}

/**
 * Shapes an SDK node for the module (`FfiNode`, see `node_ffi.rs` in the
 * search crate for the contract of each field).
 *
 * A file or photo without an active revision can't be described, so it is
 * left out, and the module reports it as failed.
 */
export function toFfiNode(node: NodeEntity): FfiNode | undefined {
    const kind = toFfiNodeKind(node);
    if (!kind) {
        return undefined;
    }
    return {
        uid: splitNodeUid(node.uid),
        parentUid: node.parentUid ? splitNodeUid(node.parentUid) : null,
        treeEventScope: node.treeEventScopeId,
        kind,
        ...toFfiName(node.name),
        nameAuthor: toFfiAuthor(node.nameAuthor),
        keyAuthor: toFfiAuthor(node.keyAuthor),
        directRole: toFfiMemberRole(node.directRole),
        membership: node.membership
            ? {
                  role: toFfiMemberRole(node.membership.role),
                  inviteTime: toUnixSeconds(node.membership.inviteTime),
                  sharedBy: toFfiAuthor(node.membership.sharedBy),
              }
            : null,
        ownerEmail: node.ownedBy.email ?? null,
        ownerOrganization: node.ownedBy.organization ?? null,
        isShared: node.isShared,
        isSharedByUrl: node.isSharedByUrl,
        creationTime: toUnixSeconds(node.creationTime),
        modificationTime: toUnixSeconds(node.modificationTime),
        trashTime: node.trashTime ? toUnixSeconds(node.trashTime) : null,
        errors: (node.errors ?? []).map(errorMessage),
    };
}

function toFfiNodeKind(node: NodeEntity): FfiNodeKind | undefined {
    switch (node.type) {
        case NodeType.File:
        case NodeType.Photo: {
            if (!node.activeRevision) {
                return undefined;
            }
            const file = {
                mediaType: node.mediaType ?? null,
                totalStorageSize: BigInt(node.totalStorageSize ?? 0),
                activeRevision: toFfiRevision(node.activeRevision),
            };
            return node.type === NodeType.File ? { tag: 'File', value0: file } : { tag: 'Photo', value0: file };
        }
        case NodeType.Folder:
            return {
                tag: 'Folder',
                value0: {
                    claimedModificationTime: node.folder?.claimedModificationTime
                        ? toUnixSeconds(node.folder.claimedModificationTime)
                        : null,
                    isImported: node.folder?.isImported ?? false,
                },
            };
        case NodeType.Album:
            return { tag: 'Album' };
    }
}

function toFfiRevision(revision: Revision): FfiRevision {
    return {
        uid: revision.uid,
        state: toFfiRevisionState(revision.state),
        creationTime: toUnixSeconds(revision.creationTime),
        contentAuthor: toFfiAuthor(revision.contentAuthor),
        storageSize: BigInt(revision.storageSize),
        isImported: revision.isImported,
        claimedSize: revision.claimedSize === undefined ? null : BigInt(revision.claimedSize),
        claimedModificationTime: revision.claimedModificationTime
            ? toUnixSeconds(revision.claimedModificationTime)
            : null,
        claimedSha1: revision.claimedDigests?.sha1 ?? null,
        claimedSha1Verified: revision.claimedDigests?.sha1Verified ?? false,
        claimedAdditionalMetadata: revision.claimedAdditionalMetadata
            ? JSON.stringify(revision.claimedAdditionalMetadata)
            : null,
    };
}

/** An invalid name passes its placeholder; an undecryptable one has none. */
function toFfiName(name: NodeEntity['name']): Pick<FfiNode, 'name' | 'nameError'> {
    if (name.ok) {
        return { name: name.value, nameError: null };
    }
    if (name.error instanceof Error) {
        return { name: '', nameError: name.error.message };
    }
    return { name: name.error.name, nameError: name.error.error };
}

/** An unverified author passes the claimed author with the verification error. */
function toFfiAuthor(author: Author): FfiAuthor {
    if (author.ok) {
        return { email: author.value, verificationError: null };
    }
    return { email: author.error.claimedAuthor ?? null, verificationError: author.error.error };
}

// Literal values of the module's enums: the bindings' runtime constants can't
// be imported here, as the SDK must not load them outside of search.
const FFI_MEMBER_ROLES: Record<MemberRole, FfiMemberRole> = {
    [MemberRole.Inherited]: 0,
    [MemberRole.Viewer]: 1,
    [MemberRole.Editor]: 2,
    [MemberRole.Admin]: 3,
};

function toFfiMemberRole(role: MemberRole): FfiMemberRole {
    return FFI_MEMBER_ROLES[role];
}

function toFfiRevisionState(state: RevisionState): FfiRevisionState {
    return state === RevisionState.Active ? 0 : 1;
}

function toUnixSeconds(date: Date): bigint {
    return BigInt(Math.floor(date.getTime() / 1000));
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
