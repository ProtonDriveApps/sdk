import path from 'node:path';

import { Author, NodeEntity, Revision, RevisionState } from '@protontech/drive-sdk';

import { createLocalFolder, downloadRemoteFile, isUnsupportedForDownload } from '../fileSystem/downloadOperations';
import { type QueueItemFile } from '../fileSystem/transferQueue';
import { formatTransferErrorMessage } from '../fileSystem/transferSummary';
import { ALREADY_EXISTS_MESSAGE, MANIFEST_FILE_NAME } from './const';
import type { TakeoutFileData, TakeoutNodeContext } from './interface';
import { type SerializedName, serializeNodeName } from './transferManifest';
import { writeJsonFile } from './writeManifest';

const DOCS_UNSUPPORTED_FILE_MESSAGE = 'Docs or Sheets are not supported in takeout.';

/**
 * Manifest of one exported file, describing the node and every version of it
 * that was written.
 */
export type TakeoutManifestNode = SerializedName & {
    uid: string;
    keyAuthor: SerializedAuthor;
    nameAuthor: SerializedAuthor;
    mediaType?: string;
    latestRevision?: TakeoutManifestRevision;
    /** Older versions, present only when the `revisions` section was requested. */
    previousRevisions?: TakeoutManifestRevision[];
    failedRevisions?: TakeoutManifestFailedRevision[];
};

type TakeoutManifestRevision = {
    uid: string;
    contentAuthor: SerializedAuthor;
    extendedAttributes: SerializedExtendedAttributes;
    creationTime: string;
    /** Path relative to this manifest, always with POSIX separators. */
    path: string;
};

type TakeoutManifestFailedRevision = {
    uid: string;
    creationTime: string;
    error: string;
};

/**
 * Author serialized as an object rather than a bare string, so an unverified
 * author is representable without ambiguity:
 *
 * * verified: `{ email: 'alice@example.com', verified: true }`
 * * anonymous: `{ email: null, verified: true }`
 * * unverified: `{ email: 'alice@example.com', verified: false, error: '…' }`
 */
type SerializedAuthor = {
    email: string | null;
    verified: boolean;
    error?: string;
};

type SerializedExtendedAttributes = {
    claimedModificationTime?: string;
    claimedAdditionalMetadata?: object;
};

/** How the file ended up on disk, so the section manifest can record it. */
export type TakeoutNodeResult =
    | { kind: 'skipped'; reason: string }
    | { kind: 'file'; bytes: number }
    /**
     * `errors` lists the revisions that could not be exported, so the section
     * manifest reports the file as failed even though the folder was written.
     */
    | { kind: 'revisions'; bytes: number; errors: unknown[] };

type ExportedRevision = {
    revision: Revision;
    fileName: string;
};

type FailedRevision = {
    revision: Revision;
    error: unknown;
};

/**
 * Writes one remote file into the takeout, together with the manifest that
 * describes it. Every file takeout exports goes through here, photos included,
 * so there is a single place deciding what a file looks like on disk.
 *
 * A file is written as a plain file with its manifest next to it, unless
 * revisions are requested and the file actually has more than one, in which
 * case it becomes a folder named after the file holding one content file per
 * revision plus a manifest covering all of them.
 */
export async function exportNode(
    ctx: TakeoutNodeContext,
    item: QueueItemFile<TakeoutFileData>,
): Promise<TakeoutNodeResult> {
    if (isUnsupportedForDownload(item.remoteNode)) {
        return { kind: 'skipped', reason: DOCS_UNSUPPORTED_FILE_MESSAGE };
    }

    if (!ctx.exportRevisions) {
        return await exportLatestRevision(ctx, item);
    }

    const revisions = await Array.fromAsync(ctx.iterateRevisions(item.remoteNode));
    if (revisions.length <= 1) {
        return await exportLatestRevision(ctx, item);
    }
    return await exportAllRevisions(ctx, item, revisions);
}

async function exportLatestRevision(
    ctx: TakeoutNodeContext,
    item: QueueItemFile<TakeoutFileData>,
): Promise<TakeoutNodeResult> {
    const revision = item.revision ?? item.remoteNode.activeRevision;
    if (!revision) {
        // This should never happen as we do not enqueue files without a revision (drafts).
        throw new Error('This file has no content that could be exported.');
    }

    const bytes = await downloadRemoteFile(ctx.download, { ...item, revision });
    if (bytes === false) {
        return { kind: 'skipped', reason: ALREADY_EXISTS_MESSAGE };
    }

    const manifest = buildNodeManifest(item.remoteNode, { revision, fileName: item.baseName });
    await writeJsonFile(nodeManifestPath(item), manifest);
    return { kind: 'file', bytes };
}

function nodeManifestPath(item: QueueItemFile<TakeoutFileData>): string {
    return path.join(path.dirname(item.localPath), item.manifestName);
}

async function exportAllRevisions(
    ctx: TakeoutNodeContext,
    item: QueueItemFile<TakeoutFileData>,
    revisions: Revision[],
): Promise<TakeoutNodeResult> {
    const folderPath = await createLocalFolder(ctx.download, {
        kind: 'directory',
        remoteNode: item.remoteNode,
        localPath: item.localPath,
        baseName: item.baseName,
    });
    if (!folderPath) {
        return { kind: 'skipped', reason: ALREADY_EXISTS_MESSAGE };
    }

    const extension = path.extname(item.baseName);
    const downloaded: ExportedRevision[] = [];
    const failed: FailedRevision[] = [];
    const skipped: FailedRevision[] = [];
    let bytes = 0;

    // A revision that fails does not abort the export: the folder is written
    // with whatever landed and the manifest lists the rest, so the folder is
    // never a set of timestamped files a consumer cannot interpret.
    for (const revision of revisions) {
        const fileName = getRevisionFileName(revision, extension);
        try {
            const revisionBytes = await downloadRemoteFile(ctx.download, {
                kind: 'file',
                remoteNode: item.remoteNode,
                revision,
                localPath: path.join(folderPath, fileName),
                baseName: fileName,
            });
            if (revisionBytes === false) {
                skipped.push({ revision, error: ALREADY_EXISTS_MESSAGE });
                continue;
            }
            bytes += revisionBytes;
            downloaded.push({ revision, fileName });
        } catch (error: unknown) {
            failed.push({ revision, error });
        }
    }

    const latest = downloaded.find(({ revision }) => revision.state === RevisionState.Active);
    const previous = downloaded.filter(({ revision }) => revision.state !== RevisionState.Active);

    const manifest = buildNodeManifest(item.remoteNode, latest, previous, [...failed, ...skipped]);
    await writeJsonFile(path.join(folderPath, MANIFEST_FILE_NAME), manifest);
    return { kind: 'revisions', bytes, errors: failed.map(({ error }) => error) };
}

export function buildNodeManifest(
    node: NodeEntity,
    latest: ExportedRevision | undefined,
    previous: ExportedRevision[] = [],
    failed: FailedRevision[] = [],
): TakeoutManifestNode {
    return {
        ...serializeNodeName(node),
        uid: node.uid,
        keyAuthor: serializeAuthor(node.keyAuthor),
        nameAuthor: serializeAuthor(node.nameAuthor),
        mediaType: node.mediaType,
        latestRevision: latest ? buildRevisionManifest(latest) : undefined,
        previousRevisions: previous.length > 0 ? previous.map(buildRevisionManifest) : undefined,
        failedRevisions: failed.length > 0 ? failed.map(buildFailedRevisionManifest) : undefined,
    };
}

function buildRevisionManifest({ revision, fileName }: ExportedRevision): TakeoutManifestRevision {
    return {
        uid: revision.uid,
        contentAuthor: serializeAuthor(revision.contentAuthor),
        extendedAttributes: serializeExtendedAttributes(revision),
        creationTime: revision.creationTime.toISOString(),
        path: `./${fileName}`,
    };
}

function buildFailedRevisionManifest({ revision, error }: FailedRevision): TakeoutManifestFailedRevision {
    return {
        uid: revision.uid,
        creationTime: revision.creationTime.toISOString(),
        error: formatTransferErrorMessage(error),
    };
}

export function serializeAuthor(author: Author): SerializedAuthor {
    if (author.ok) {
        return { email: author.value, verified: true };
    }
    return {
        email: author.error.claimedAuthor ?? null,
        verified: false,
        error: author.error.error,
    };
}

export function serializeExtendedAttributes(revision: Revision): SerializedExtendedAttributes {
    return {
        claimedModificationTime: revision.claimedModificationTime?.toISOString(),
        claimedAdditionalMetadata: revision.claimedAdditionalMetadata,
    };
}

/**
 * Combines the revision creation time with the revision id, which keeps the
 * names sorted and unique by construction. The original extension is preserved
 * so the files open normally.
 */
function getRevisionFileName(revision: Revision, extension: string): string {
    const timestamp = revision.creationTime
        .toISOString()
        .replace(/\.\d{3}Z$/u, 'Z')
        .replace(/:/gu, '-');
    return `${timestamp}_${getRevisionId(revision)}${extension}`;
}

function getRevisionId(revision: Revision): string {
    const segments = revision.uid.split('~');
    return segments[segments.length - 1] ?? revision.uid;
}
