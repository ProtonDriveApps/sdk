import { Logger, NodeEntity, ProtonDriveClient, Revision } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import type { DownloadContext, DownloadFileData } from '../fileSystem/downloadOperations';

/**
 * Necessary dependencies for takeout executers.
 */
export type TakeoutContext = {
    logger: Logger;
    sdk: ProtonDriveClient;
    photosSdk: ProtonDrivePhotosClient;
    /** Root of the takeout; nothing may be written outside of it. */
    takeoutRoot: string;
    driveNode: TakeoutNodeContext;
    photoNode: TakeoutNodeContext;
    createFolder: (absolutePath: string) => Promise<void>;
};

/**
 * Necessary dependencies for downloading the node contents.
 */
export type TakeoutNodeContext = {
    download: DownloadContext;
    exportRevisions: boolean;
    iterateRevisions: (node: NodeEntity) => AsyncIterable<Revision>;
};

/** Remote data of a file item in takeout, including its per-file manifest name. */
export type TakeoutFileData = DownloadFileData & {
    /** Manifest file name allocated together with the content file name. */
    manifestName: string;
};
