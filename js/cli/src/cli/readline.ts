import * as readline from 'node:readline/promises';

let chain: Promise<unknown> = Promise.resolve();

/**
 * Prompt user for input. Only one prompt can be active at a time. When any
 * another question comes in, it waits for the previous input to be processed.
 *
 * Returns `null` when stdin reaches EOF (e.g. Ctrl-D on an empty line).
 */
export function question(prompt: string): Promise<string | null> {
    const task = chain.then(async (): Promise<string | null> => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        let closed = false;
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
                    .then((value) => settle(() => resolve(value)))
                    .catch((error) => settle(() => reject(error)));
            });
        } finally {
            if (!closed) {
                rl.close();
            }
        }
    });
    chain = task.catch(() => undefined);
    return task;
}

export function resetForTests(): void {
    chain = Promise.resolve();
}
