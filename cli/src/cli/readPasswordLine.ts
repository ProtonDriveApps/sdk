import { question } from './readline';

/**
 * Read one line from stdin without echoing (TTY). Non-TTY falls back to visible readline.
 */
export async function readPasswordLine(prompt: string): Promise<string> {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
        const answer = await question(prompt);
        return (answer ?? '').trim();
    }

    return new Promise((resolve) => {
        stdout.write(prompt);

        const wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();

        let password = '';
        let settled = false;

        const cleanup = () => {
            stdin.setRawMode(wasRaw);
            stdin.removeListener('data', onData);
            stdin.removeListener('end', onEnd);
        };

        const finish = (value: string) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            stdout.write('\n');
            resolve(value);
        };

        const onEnd = () => {
            finish(password);
        };

        const onData = (chunk: Buffer | string) => {
            const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            for (const char of s) {
                // Enter, new line
                if (char === '\n' || char === '\r') {
                    finish(password);
                    return;
                }
                // Ctrl+D
                if (char === '\u0004') {
                    finish(password);
                    return;
                }
                // Ctrl+C
                if (char === '\u0003') {
                    cleanup();
                    process.exit(130);
                }
                // Backspace (delete 0x7F, backspace 0x08)
                if (char === '\u007f' || char === '\b') {
                    password = password.slice(0, -1);
                    continue;
                }
                password += char;
            }
        };

        stdin.on('end', onEnd);
        stdin.on('data', onData);
    });
}
