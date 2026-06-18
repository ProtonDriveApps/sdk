import * as readline from 'node:readline/promises';

let chain: Promise<unknown> = Promise.resolve();

const history: string[] = [];

const historySize = 1000;

export type QuestionOptions = {
    /** When true, Up/Down arrows recall prior prompts (REPL-style). */
    enableHistory?: boolean;
};

/**
 * Prompt user for input. Only one prompt can be active at a time. When any
 * another question comes in, it waits for the previous input to be processed.
 *
 * Returns `null` when stdin reaches EOF (e.g. Ctrl-D on an empty line).
 */
export function question(prompt: string, options: QuestionOptions = {}): Promise<string | null> {
    const enableHistory = options.enableHistory ?? false;
    const task = chain.then(async (): Promise<string | null> => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            ...(enableHistory ? { history: [...history], historySize } : {}),
        });
        let closed = false;
        let answer: string | null = null;
        try {
            return await new Promise<string | null>((resolve, reject) => {
                let settled = false;
                const settle = (callback: () => void) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    callback();
                };

                rl.once('close', () => {
                    closed = true;
                    settle(() => resolve(null));
                });
                rl.question(prompt)
                    .then((value) => {
                        answer = value;
                        settle(() => resolve(value));
                    })
                    .catch((error) => settle(() => reject(error)));
            });
        } finally {
            if (enableHistory) {
                syncHistory(rl, answer);
            }
            if (!closed) {
                rl.close();
            }
        }
    });
    chain = task.catch(() => undefined);
    return task;
}

function syncHistory(rl: readline.Interface, answer: string | null): void {
    // Try first to use the whole history from the readline interface.
    const rlHistory = (rl as readline.Interface & { history?: readonly string[] }).history;
    if (rlHistory !== undefined && rlHistory.length > 0) {
        history.length = 0;
        history.push(...rlHistory);
        trimHistory();
        return;
    }
    // As backup, use the typed answer and preserve previous history (newest-first, like Node readline).
    if (answer !== null && answer.length > 0 && history[0] !== answer) {
        history.unshift(answer);
        trimHistory();
    }
}

/** Drop oldest entries; keep the most recent `historySize` prompts (newest-first). */
function trimHistory(): void {
    if (history.length > historySize) {
        history.splice(historySize);
    }
}

export function resetForTests(): void {
    chain = Promise.resolve();
    history.length = 0;
}
