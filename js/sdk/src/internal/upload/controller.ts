import { waitForCondition } from '../wait';

export class UploadController {
    private paused = false;
    public promise?: Promise<{ nodeRevisionUid: string, nodeUid: string }>;

    async waitIfPaused(): Promise<void> {
        await waitForCondition(() => !this.paused);
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    async completion(): Promise<{ nodeRevisionUid: string, nodeUid: string }> {
        if (!this.promise) {
            throw new Error('UploadController.completion() called before upload started');
        }
        return await this.promise;
    }
}
