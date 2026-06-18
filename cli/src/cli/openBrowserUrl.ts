import { spawn } from 'node:child_process';

/**
 * Opens `url` in the system default browser. Fails silently (e.g. no GUI, SSH).
 * Only http(s) URLs are opened; invalid or other schemes are ignored.
 */
export function openBrowserUrl(rawUrl: string): void {
    const url = getAllowedBrowserUrl(rawUrl);
    if (!url) {
        return;
    }

    const child =
        process.platform === 'darwin'
            ? spawn('open', [url], { detached: true, stdio: 'ignore' })
            : process.platform === 'win32'
              ? // /d: skip auto run
                // /s: make quoting rules more strict
                // /c: execute command and exit
                spawn('start', ['', url], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                })
              : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });

    child.on('error', () => {});
    child.unref();
}

function getAllowedBrowserUrl(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.href;
        }
    } catch {}
}
