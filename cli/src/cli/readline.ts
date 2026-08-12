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
    const task = chain.then(() => askQuestion(prompt, enableHistory));
    chain = task.catch(() => undefined);
    return task;
}

/**
 * Prompt once, recreating the readline interface after job-control resume (Ctrl-Z / fg).
 * Suspending clobbers TTY settings; Node's readline does not recover unless the interface
 * is restarted on SIGCONT.
 */
async function askQuestion(prompt: string, enableHistory: boolean): Promise<string | null> {
    while (true) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            ...(enableHistory ? { history: [...history], historySize } : {}),
        });

        const sigcontAbortController = new AbortController();

        rl.on('SIGCONT', () => {
            sigcontAbortController.abort();
            rl.close();
        });

        const eof = new Promise<null>((resolve) => {
            rl.once('close', () => {
                if (!sigcontAbortController.signal.aborted) {
                    resolve(null);
                }
            });
        });

        try {
            const answer = await Promise.race([rl.question(prompt, { signal: sigcontAbortController.signal }), eof]);

            if (answer === null) {
                return null;
            }

            if (enableHistory) {
                syncHistory(rl, answer);
            }
            return answer;
        } catch (error: unknown) {
            if (sigcontAbortController.signal.aborted) {
                // Defer until Node's own SIGCONT handler finishes setRawMode + refreshLine.
                await new Promise<void>((resolve) => setImmediate(resolve));
                continue;
            }
            throw error;
        } finally {
            rl.close();
        }
    }
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
