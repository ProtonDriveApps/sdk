import { formatSize, sanitizeTerminalText } from 'src/cli/formatters';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface TransferProgressInterface {
    trackItem(name: string, size?: number): TransferProgressItem;

    /** Pause the progress display. Use for prompts for the user. */
    pause(): void;
    resume(): void;

    dispose(): void;
}

interface TransferProgressItem {
    onProgress: (uploadedBytes: number) => void;
    onFinished: () => void;
}

export function createTransferProgress(getSummaryLine: () => string): TransferProgressInterface {
    if (!process.stdout.isTTY) {
        return noopSink;
    }
    return new TransferProgress(getSummaryLine);
}

const noopSink: TransferProgressInterface = {
    trackItem: () => ({
        onProgress: () => {},
        onFinished: () => {},
    }),
    pause: () => {},
    resume: () => {},
    dispose: () => {},
};

class TransferProgress implements TransferProgressInterface {
    private readonly active = new Map<
        string,
        {
            name: string;
            size?: number;
            progress: number;
        }
    >();
    private nextId = 0;
    private spinnerIndex = 0;
    private interval: ReturnType<typeof setInterval> | null = null;
    private paused = false;
    private previousLineCount = 0;

    constructor(private readonly getSummaryLine: () => string) {}

    trackItem(name: string, size?: number): TransferProgressItem {
        const id = String(this.nextId++);
        this.active.set(id, {
            name,
            size,
            progress: 0,
        });
        this.ensureTicking();
        this.redraw();

        const onProgress = (uploadedBytes: number) => {
            // Ensure the item is not re-added to the map when onProgress is
            // called after onFinished.
            const item = this.active.get(id);
            if (!item) {
                return;
            }

            item.progress = uploadedBytes;
            this.active.set(id, {
                name,
                size,
                progress: uploadedBytes,
            });

            // No need to redraw here, the ticking will do it.
        };

        const onFinished = () => {
            this.active.delete(id);
            this.redraw();
            if (this.active.size === 0) {
                this.stopTicking();
            }
        };

        return {
            onProgress,
            onFinished,
        };
    }

    pause(): void {
        if (this.paused) {
            return;
        }
        this.paused = true;
        this.stopTicking();
        this.clearBlock();
    }

    resume(): void {
        if (!this.paused) {
            return;
        }
        this.paused = false;
        if (this.active.size > 0) {
            this.ensureTicking();
        }
        this.redraw();
    }

    dispose(): void {
        this.stopTicking();
        this.clearBlock();
        this.active.clear();
    }

    private ensureTicking(): void {
        if (this.interval !== null || this.paused) {
            return;
        }
        this.interval = setInterval(() => {
            this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
            this.redraw();
        }, 80);
    }

    private stopTicking(): void {
        if (this.interval !== null) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    /**
     * Removes the last drawn progress block from the TTY. Uses ECMA-48 (ANSI) control
     * strings (`\x1b` = ESC, starts a CSI sequence):
     * - `[?25l` / `[?25h` — DECTCEM: hide / show the cursor (reduces flicker while rewriting).
     * - `[1A` — cursor up one line (repeat for each previously printed line).
     * - `[2K` — erase the whole current line; `\r` — move to column 0 on that line.
     */
    private clearBlock(): void {
        if (this.previousLineCount === 0) {
            return;
        }
        let out = '\x1b[?25l';
        for (let i = 0; i < this.previousLineCount; i++) {
            out += '\x1b[1A\x1b[2K\r';
        }
        out += '\x1b[?25h';
        process.stdout.write(out);
        this.previousLineCount = 0;
    }

    private redraw(): void {
        if (this.paused) {
            return;
        }

        const frame = SPINNER_FRAMES[this.spinnerIndex % SPINNER_FRAMES.length]!;
        const summaryLine = `ℹ ${this.getSummaryLine()}`;
        const itemLines =
            this.active.size === 0
                ? []
                : Array.from(
                      this.active.values(),
                      (item) =>
                          `${frame} ${getProgressPercentage(item)} ${sanitizeTerminalText(item.name)} (${formatSize(item.size, true)})`,
                  );
        const lines = [summaryLine, ...itemLines];

        if (itemLines.length === 0 && this.previousLineCount <= 1) {
            return;
        }

        // See doc for `clearBlock` for details.
        let out = '\x1b[?25l';
        for (let i = 0; i < this.previousLineCount; i++) {
            out += '\x1b[1A\x1b[2K\r';
        }

        this.previousLineCount = lines.length;

        for (const line of lines) {
            out += `${line}\n`;
        }
        out += '\x1b[?25h';
        process.stdout.write(out);
    }
}

function getProgressPercentage(item: { progress: number; size?: number }): string {
    if (item.size === undefined) {
        return '';
    }
    return `${((item.progress / item.size) * 100).toFixed(2)}%`;
}
