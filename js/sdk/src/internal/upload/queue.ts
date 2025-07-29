import { waitForCondition } from '../wait';

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
const MAX_CONCURRENT_UPLOADS = 5;

export class UploadQueue {
    private capacity = 0;

    // TODO: use expected size to control the size of the queue
    async waitForCapacity(signal?: AbortSignal) {
        await waitForCondition(() => this.capacity < MAX_CONCURRENT_UPLOADS, signal);
        this.capacity++;
    }

    releaseCapacity() {
        this.capacity--;
    }
}
