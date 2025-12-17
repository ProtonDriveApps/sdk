import { AbortError } from '../../errors';
import { waitForCondition } from '../wait';

export class DownloadController {
    private paused = false;
    public promise?: Promise<void>;
    private _isDownloadCompleteWithSignatureIssues = false;

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

    async completion(): Promise<void> {
        await this.promise;
    }

    isDownloadCompleteWithSignatureIssues(): boolean {
        return this._isDownloadCompleteWithSignatureIssues;
    }

    setIsDownloadCompleteWithSignatureIssues(value: boolean): void {
        this._isDownloadCompleteWithSignatureIssues = value;
    }
}
