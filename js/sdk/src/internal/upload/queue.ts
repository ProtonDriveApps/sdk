import { waitForCondition } from '../wait';
import { FILE_CHUNK_SIZE } from './streamUploader';

/**
 * Maximum number of concurrent file uploads.
 *
 * It avoids uploading too many files at the same time. The total file size
 * below also limits that, but if the file is empty, we still need to make
 * a reasonable number of requests.
 */
const DEFAULT_MAX_CONCURRENT_FILE_UPLOADS = 8;

/**
 * Maximum total file size that can be uploaded concurrently.
 *
 * It avoids uploading too many blocks at the same time, ensuring that on poor
 * connection we don't do too many things at the same time that all fail due
 * to network issues.
 */
const DEFAULT_MAX_CONCURRENT_UPLOAD_SIZE = 16 * FILE_CHUNK_SIZE;

/**
 * A queue that limits the number of concurrent uploads.
 *
 * This is used to limit the number of concurrent uploads to avoid
 * overloading the server, or get rate limited.
 *
 * Each file upload consumes memory and is limited by the number of
 * concurrent block uploads for each file.
 *
 * This queue is straitforward and does not have any priority mechanism
 * or other features, such as limiting total number of blocks being
 * uploaded. That is something we want to add in the future to be
 * more performant for many small file uploads.
 */
export class UploadQueue {
    constructor(
        private readonly maxConcurrentFileUploads: number = DEFAULT_MAX_CONCURRENT_FILE_UPLOADS,
        private readonly maxConcurrentUploadSize: number = DEFAULT_MAX_CONCURRENT_UPLOAD_SIZE,
    ) {}

    private totalFileUploads = 0;

    private totalExpectedSize = 0;

    async waitForCapacity(expectedSize: number, signal?: AbortSignal) {
        await waitForCondition(
            () =>
                this.totalFileUploads < this.maxConcurrentFileUploads &&
                this.totalExpectedSize < this.maxConcurrentUploadSize,
            signal,
        );
        this.totalFileUploads++;
        this.totalExpectedSize += expectedSize;
    }

    releaseCapacity(expectedSize: number) {
        this.totalFileUploads--;
        this.totalExpectedSize -= expectedSize;
    }
}
