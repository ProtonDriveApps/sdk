import path from 'node:path';

import { PhotoNode } from '@protontech/drive-sdk';

import { getName } from '../../cli';
import { type QueueItemFile, TransferQueue } from '../fileSystem/transferQueue';
import { formatTransferErrorMessage, TransferSummary } from '../fileSystem/transferSummary';
import { MANIFEST_FILE_NAME } from './const';
import { exportNode, type TakeoutNodeResult } from './exportNode';
import type { TakeoutContext, TakeoutFileData } from './interface';
import { buildManifestSectionBase, type TakeoutManifestSectionBase } from './manifest';
import { NameRegistry } from './nameRegistry';
import {
    type SerializedName,
    serializeNodeName,
    type TransferManifest,
    TransferManifestBuilder,
    type TransferManifestItem,
} from './transferManifest';
import { writeJsonFile } from './writeManifest';

const PHOTOS_FOLDER = 'photos';
const TIMELINE_FOLDER = 'timeline';
const ALBUMS_FOLDER = 'albums';

/**
 * Section of the main manifest describing what `photos/` holds. Its counters
 * cover both `timeline/` and `albums/`.
 */
export type TakeoutManifestSectionPhotos = TakeoutManifestSectionBase & {
    albumCount: number;
    /**
     * Present when album export was not attempted (e.g. because the timeline could not be exported).
     */
    albumsSkippedReason?: string;
};

/**
 * Manifest written at the root of `photos/`. It is the only manifest of the
 * section: `timeline/` and `albums/` are two halves of one export and are
 * described together, each album folder adding only its own photo listing.
 */
type TakeoutManifestPhotos = {
    /** Every photo the section downloaded, in the timeline and in the albums. */
    photos: TransferManifest;
    /** One item per album; the photos of an album are in `photos`. */
    albums: TakeoutManifestAlbums;
};

type TakeoutManifestAlbums = Omit<TransferManifest, 'items'> & {
    items: TakeoutManifestAlbumItem[];
};

type TakeoutManifestAlbumItem = TransferManifestItem & {
    photoCount?: number;
};

/**
 * Manifest written inside one album folder. It lists the photos of the album
 * wherever they live, plus the ones the takeout could not place.
 */
type TakeoutManifestAlbum = {
    album: SerializedName & {
        nodeUid: string;
        creationTime: string;
        photoCount?: number;
    };
    photos: TakeoutManifestAlbumPhoto[];
    errors: { uid: string; error: string }[];
};

type TakeoutManifestAlbumPhoto = SerializedName & {
    uid: string;
    captureTime: string;
    /**
     * Where the content lives. A photo already in the timeline is not
     * duplicated, the entry points at the existing file under `timeline/`.
     */
    source: 'timeline' | 'album';
    /** Path relative to this manifest, always with POSIX separators. */
    path: string;
};

type Timeline = {
    uids: Set<string>;
    /** UID to local photo path mapping. */
    exported: Map<string, TimelinePhoto>;
};

type TimelinePhoto = SerializedName & {
    /** Path relative to `photos/`, as represented in the manifest, always with POSIX separators. */
    manifestPath: string;
};

type AlbumTarget = {
    localPath: string;
    /** Path relative to `photos/`, as represented in the manifest, always with POSIX separators. */
    manifestPath: string;
    timeline: Timeline;
};

/** Folder used for photos without a capture time. */
const UNDATED_PHOTOS_FOLDER = 'undated';

const MISSING_TIMELINE_PHOTO_MESSAGE = 'This photo is in your timeline but could not be exported.';
const MISSING_PHOTO_MESSAGE = 'This photo is no longer available.';
const ALBUMS_SKIPPED_TIMELINE_MESSAGE =
    'Album export was skipped because the photo timeline could not be exported.';

/**
 * Exports the photo timeline into `photos/timeline/` and the albums into
 * `photos/albums/`, returning the single run manifest section of both.
 *
 * They are one section because an album is expressed as links into the
 * timeline output, so the albums can only be written once the timeline pass is
 * done and the local name of every exported photo is known.
 */
export async function takeoutPhotos(
    ctx: TakeoutContext,
    summary: TransferSummary,
): Promise<TakeoutManifestSectionPhotos> {
    const sectionPath = path.join(ctx.takeoutRoot, PHOTOS_FOLDER);
    const photos = new TransferManifestBuilder();
    const albums = new TransferManifestBuilder();
    let timeline: Timeline | undefined;
    let timelineError: unknown;

    try {
        await ctx.createFolder(sectionPath);
        timeline = await exportTimeline(ctx, summary, photos, sectionPath);
    } catch (error: unknown) {
        timelineError = error;
        ctx.logger.error(`Takeout of ${PHOTOS_FOLDER}/${TIMELINE_FOLDER} failed`, error);
        summary.recordFailure(TIMELINE_FOLDER, error);
        photos.addError(error, { path: TIMELINE_FOLDER });
    }

    // Without a complete timeline an album cannot tell which of its photos are
    // already on disk, and would download every one of them again.
    const albumsResult = timeline
        ? await exportAlbums(ctx, summary, { photos, albums }, sectionPath, timeline)
        : {
              albumCount: 0,
              failures: false,
              skippedReason: `${ALBUMS_SKIPPED_TIMELINE_MESSAGE} ${formatTransferErrorMessage(timelineError)}`,
          };

    try {
        const manifest: TakeoutManifestPhotos = {
            photos: photos.build(),
            albums: albums.build() as TakeoutManifestAlbums,
        };
        await writeJsonFile(path.join(sectionPath, MANIFEST_FILE_NAME), manifest);
    } catch (error: unknown) {
        ctx.logger.error(`Photo manifest writing failed`, error);
        summary.recordFailure(PHOTOS_FOLDER, error);
        photos.addError(error, { path: MANIFEST_FILE_NAME });
    }

    return {
        ...buildManifestSectionBase(
            PHOTOS_FOLDER,
            summary.getCounters(),
            photos.hasErrors || albums.hasErrors || albumsResult.failures,
        ),
        albumCount: albumsResult.albumCount,
        ...(albumsResult.skippedReason ? { albumsSkippedReason: albumsResult.skippedReason } : {}),
    };
}

/**
 * Downloads every photo of the timeline into `timeline/<year>/<month>/` and
 * returns what albums need to link to them.
 */
async function exportTimeline(
    ctx: TakeoutContext,
    summary: TransferSummary,
    manifest: TransferManifestBuilder,
    sectionPath: string,
): Promise<Timeline> {
    const timelinePath = path.join(sectionPath, TIMELINE_FOLDER);
    const captureTimes = new Map<string, Date>();
    for await (const timelineItem of ctx.photosSdk.iterateTimeline()) {
        captureTimes.set(timelineItem.nodeUid, timelineItem.captureTime);
    }

    const exported = new Map<string, TimelinePhoto>();
    const registries = new Map<string, NameRegistry>();
    const queue = createPhotoQueue(ctx, summary);

    for await (const node of ctx.photosSdk.iterateNodes([...captureTimes.keys()])) {
        if ('missingUid' in node) {
            manifest.addError(MISSING_PHOTO_MESSAGE, { uid: node.missingUid });
            summary.recordFailure(node.missingUid, MISSING_PHOTO_MESSAGE, node.missingUid);
            continue;
        }

        const captureTime = node.photo?.captureTime ?? captureTimes.get(node.uid);
        const captureFolder = getCaptureFolder(captureTime);
        const relativeFolder = `${TIMELINE_FOLDER}/${captureFolder}`;
        const folderPath = path.join(timelinePath, ...captureFolder.split('/'));

        let registry = registries.get(relativeFolder);
        if (!registry) {
            await ctx.createFolder(folderPath);
            registry = await NameRegistry.createForFolder(folderPath);
            registries.set(relativeFolder, registry);
        }

        const { name, manifestName } = registry.allocateFileWithManifest(getName(node));
        const manifestPath = `${relativeFolder}/${name}`;
        queue.enqueuePhoto({
            remoteNode: node,
            localPath: path.join(folderPath, name),
            baseName: name,
            manifestName,
            onExported: (outcome) => {
                const item = { path: manifestPath, uid: node.uid, ...serializeNodeName(node) };
                if (outcome.kind === 'failed') {
                    manifest.addError(outcome.error, { path: manifestPath, uid: node.uid });
                } else if (outcome.kind === 'skipped') {
                    manifest.addSkippedItem(item, outcome.reason);
                } else {
                    manifest.addItem(item);
                    exported.set(node.uid, { ...serializeNodeName(node), manifestPath });
                }
            },
        });
    }

    await queue.processQueue();
    return { uids: new Set(captureTimes.keys()), exported };
}

async function exportAlbums(
    ctx: TakeoutContext,
    summary: TransferSummary,
    manifests: {
        photos: TransferManifestBuilder;
        albums: TransferManifestBuilder;
    },
    sectionPath: string,
    timeline: Timeline,
): Promise<{
    albumCount: number;
    failures: boolean;
    skippedReason?: string;
}> {
    const albumsPath = path.join(sectionPath, ALBUMS_FOLDER);
    let albumCount = 0;
    let albumErrorCount = 0;

    try {
        await ctx.createFolder(albumsPath);
        const registry = await NameRegistry.createForFolder(albumsPath);

        for await (const album of ctx.photosSdk.iterateAlbums()) {
            albumCount++;
            const folderName = registry.allocate(getName(album));
            const manifestPath = `${ALBUMS_FOLDER}/${folderName}`;
            const albumPath = path.join(albumsPath, folderName);

            try {
                await ctx.createFolder(albumPath);
                manifests.albums.addItem({
                    path: manifestPath,
                    uid: album.uid,
                    ...serializeNodeName(album),
                    photoCount: album.album?.photoCount,
                } as TransferManifestItem);

                albumErrorCount += await exportAlbum(ctx, summary, manifests.photos, album, {
                    localPath: albumPath,
                    manifestPath,
                    timeline,
                });
            } catch (error: unknown) {
                summary.recordFailure(manifestPath, error, album.uid);
                manifests.albums.addError(error, { path: manifestPath, uid: album.uid });
            }
        }
    } catch (error: unknown) {
        ctx.logger.error(`Takeout of ${PHOTOS_FOLDER}/${ALBUMS_FOLDER} failed`, error);
        summary.recordFailure(ALBUMS_FOLDER, error);
        manifests.albums.addError(error, { path: ALBUMS_FOLDER });
    }

    return { albumCount, failures: albumErrorCount > 0 };
}

async function exportAlbum(
    ctx: TakeoutContext,
    summary: TransferSummary,
    photosManifest: TransferManifestBuilder,
    album: PhotoNode,
    target: AlbumTarget,
): Promise<number> {
    const photos: TakeoutManifestAlbumPhoto[] = [];
    const errors: TakeoutManifestAlbum['errors'] = [];
    const albumOnlyCaptureTimes = new Map<string, Date>();

    for await (const albumItem of ctx.photosSdk.iterateAlbum(album.uid)) {
        if (!target.timeline.uids.has(albumItem.nodeUid)) {
            albumOnlyCaptureTimes.set(albumItem.nodeUid, albumItem.captureTime);
            continue;
        }

        const timelinePhoto = target.timeline.exported.get(albumItem.nodeUid);
        if (!timelinePhoto) {
            errors.push({ uid: albumItem.nodeUid, error: MISSING_TIMELINE_PHOTO_MESSAGE });
            summary.recordFailure(albumItem.nodeUid, MISSING_TIMELINE_PHOTO_MESSAGE, albumItem.nodeUid);
            continue;
        }
        photos.push({
            uid: albumItem.nodeUid,
            originalName: timelinePhoto.originalName,
            error: timelinePhoto.error,
            captureTime: albumItem.captureTime.toISOString(),
            source: 'timeline',
            path: path.posix.relative(target.manifestPath, timelinePhoto.manifestPath),
        });
    }

    if (albumOnlyCaptureTimes.size > 0) {
        const albumOnlyResult = await exportAlbumOnlyPhotos(
            ctx,
            summary,
            photosManifest,
            albumOnlyCaptureTimes,
            target,
        );
        photos.push(...albumOnlyResult.photos);
        errors.push(...albumOnlyResult.errors);
    }

    const manifest: TakeoutManifestAlbum = {
        album: {
            nodeUid: album.uid,
            ...serializeNodeName(album),
            creationTime: album.creationTime.toISOString(),
            photoCount: album.album?.photoCount,
        },
        photos,
        errors,
    };
    await writeJsonFile(path.join(target.localPath, MANIFEST_FILE_NAME), manifest);
    return errors.length;
}

/**
 * Downloads the photos an album has that the timeline does not, into the album
 * folder.
 */
async function exportAlbumOnlyPhotos(
    ctx: TakeoutContext,
    summary: TransferSummary,
    photosManifest: TransferManifestBuilder,
    captureTimes: Map<string, Date>,
    target: AlbumTarget,
): Promise<Pick<TakeoutManifestAlbum, 'photos' | 'errors'>> {
    const photos: TakeoutManifestAlbumPhoto[] = [];
    const errors: TakeoutManifestAlbum['errors'] = [];
    const registry = await NameRegistry.createForFolder(target.localPath);
    const queue = createPhotoQueue(ctx, summary);

    for await (const node of ctx.photosSdk.iterateNodes([...captureTimes.keys()])) {
        if ('missingUid' in node) {
            errors.push({ uid: node.missingUid, error: MISSING_PHOTO_MESSAGE });
            photosManifest.addError(MISSING_PHOTO_MESSAGE, { path: target.manifestPath, uid: node.missingUid });
            summary.recordFailure(node.missingUid, MISSING_PHOTO_MESSAGE, node.missingUid);
            continue;
        }

        const { name, manifestName } = registry.allocateFileWithManifest(getName(node));
        const manifestPath = `${target.manifestPath}/${name}`;
        const captureTime = node.photo?.captureTime ?? captureTimes.get(node.uid) ?? node.creationTime;
        queue.enqueuePhoto({
            remoteNode: node,
            localPath: path.join(target.localPath, name),
            baseName: name,
            manifestName,
            onExported: (outcome) => {
                const item = { path: manifestPath, uid: node.uid, ...serializeNodeName(node) };
                if (outcome.kind === 'failed') {
                    errors.push({ uid: node.uid, error: formatTransferErrorMessage(outcome.error) });
                    photosManifest.addError(outcome.error, { path: manifestPath, uid: node.uid });
                } else if (outcome.kind === 'skipped') {
                    errors.push({ uid: node.uid, error: outcome.reason });
                    photosManifest.addSkippedItem(item, outcome.reason);
                } else {
                    photosManifest.addItem(item);
                    photos.push({
                        uid: node.uid,
                        ...serializeNodeName(node),
                        captureTime: captureTime.toISOString(),
                        source: 'album',
                        path: `./${name}`,
                    });
                }
            },
        });
    }

    await queue.processQueue();
    return { photos, errors };
}

function createPhotoQueue(ctx: TakeoutContext, summary: TransferSummary): PhotoQueue {
    return new PhotoQueue(ctx.logger, summary, {
        // Photos are always leaves here; the folders they live in are created
        // directly because they have no remote counterpart.
        onDirectory: async () => {
            throw new Error('Unexpected folder in the photo takeout');
        },
        startFile: async (item) => {
            let result: TakeoutNodeResult;
            try {
                result = await exportNode(ctx.photoNode, item);
            } catch (error: unknown) {
                item.onExported({ kind: 'failed', error });
                throw error;
            }
            item.onExported(result);
            return result.kind === 'skipped' ? false : result.bytes;
        },
    });
}

type PhotoItemData = TakeoutFileData & {
    onExported: (outcome: PhotoOutcome) => void;
};

type PhotoOutcome = TakeoutNodeResult | { kind: 'failed'; error: unknown };

class PhotoQueue extends TransferQueue<PhotoItemData> {
    enqueuePhoto(item: Omit<QueueItemFile<PhotoItemData>, 'kind'>): void {
        this.enqueueItem({ kind: 'file', ...item });
    }
}

function getCaptureFolder(captureTime?: Date): string {
    if (!captureTime) {
        return UNDATED_PHOTOS_FOLDER;
    }
    const year = captureTime.getUTCFullYear();
    const month = `${captureTime.getUTCMonth() + 1}`.padStart(2, '0');
    return `${year}/${month}`;
}
