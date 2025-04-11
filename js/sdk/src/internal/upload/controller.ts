import { waitForCondition } from '../wait';

export class UploadController {
    private paused = false;
    public promise?: Promise<string>;

    async waitIfPaused(): Promise<void> {
        await waitForCondition(() => !this.paused);
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    async completion(): Promise<string> {
        if (!this.promise) {
            throw new Error('UploadController.completion() called before upload started');
        }
        return await this.promise;
    }
}
