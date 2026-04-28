import * as readline from 'node:readline/promises';

let chain: Promise<unknown> = Promise.resolve();

/**
 * Prompt user for input. Only one prompt can be active at a time. When any
 * another question comes in, it waits for the previous input to be processed.
 */
export async function question(prompt: string): Promise<string> {
    const task = chain.then(async (): Promise<string> => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        try {
            return await rl.question(prompt);
        } finally {
            rl.close();
        }
    });
    chain = task.catch(() => undefined);
    return task;
}

export function resetForTests(): void {
    chain = Promise.resolve();
}
