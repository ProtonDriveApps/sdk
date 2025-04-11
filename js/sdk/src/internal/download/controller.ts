import { waitForCondition } from '../wait';

export class DownloadController {
    private paused = false;
    public promise?: Promise<void>;

    async waitWhilePaused(): Promise<void> {
        await waitForCondition(() => !this.paused);
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    async completion(): Promise<void> {
        await this.promise;
    }
}
