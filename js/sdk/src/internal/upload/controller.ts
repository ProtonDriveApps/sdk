import { AbortError } from '../../errors';
import { waitForCondition } from '../wait';

export class UploadController {
    private paused = false;
    public promise?: Promise<{ nodeRevisionUid: string; nodeUid: string }>;

    constructor(private signal?: AbortSignal) {
        this.signal = signal;
    }

    async waitWhilePaused(): Promise<void> {
        try {
            await waitForCondition(() => !this.paused, this.signal);
        } catch (error) {
            if (error instanceof AbortError) {
                return;
            }
            throw error;
        }
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    async completion(): Promise<{ nodeRevisionUid: string; nodeUid: string }> {
        if (!this.promise) {
            throw new Error('UploadController.completion() called before upload started');
        }
        return await this.promise;
    }
}
