import fs from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from '@protontech/drive-sdk';

export const EVENTS_LOCK_FILE = 'events.lock';

type EventsLockPayload = {
    pid: number;
};

/**
 * Try to acquire the events lock. If another process holds the lock, return false.
 * If there is a lock file, but the process is not alive, remove it and try again.
 *
 * Call `releaseEventsLock` to release the lock at the end of the process.
 */
export async function tryAcquireEventsLock(cacheDir: string): Promise<boolean> {
    const lockPath = eventsLockPath(cacheDir);
    await fs.mkdir(cacheDir, { recursive: true });

    try {
        const raw = await fs.readFile(lockPath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        const holderPid =
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof (parsed as { pid?: unknown }).pid === 'number'
                ? (parsed as { pid: number }).pid
                : NaN;

        if (Number.isInteger(holderPid) && holderPid > 0 && isProcessAlive(holderPid)) {
            return false;
        }
        await fs.unlink(lockPath).catch(() => {});
    } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        // ENOENT = no such file or directory
        if (err.code !== 'ENOENT') {
            throw error;
        }
    }

    const payload: EventsLockPayload = { pid: process.pid };
    try {
        await fs.writeFile(lockPath, JSON.stringify(payload), {
            flag: 'wx', // Fail if file already exists.
            encoding: 'utf8',
        });
    } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        // EEXIST = file already exists
        if (err.code === 'EEXIST') {
            return false;
        }
        throw error;
    }
    return true;
}

function eventsLockPath(cacheDir: string): string {
    return path.join(cacheDir, EVENTS_LOCK_FILE);
}

function isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        // 0 is a signal to check if the process is alive.
        process.kill(pid, 0);
        return true;
    } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        // ESRCH = no such process
        if (err.code === 'ESRCH') {
            return false;
        }
        // EPERM = operation not permitted (e.g. process is running for our perspective)
        if (err.code === 'EPERM') {
            return true;
        }
        return false;
    }
}

/**
 * Releases the events lock if the current process is the holder.
 */
export async function releaseEventsLock(logger: Logger, cacheDir: string): Promise<void> {
    const lockPath = eventsLockPath(cacheDir);
    let raw: string;
    try {
        raw = await fs.readFile(lockPath, 'utf8');
    } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        // ENOENT = no such file or directory
        if (err.code === 'ENOENT') {
            return;
        }
        throw error;
    }

    try {
        const parsed = JSON.parse(raw) as { pid?: number };
        if (parsed.pid === process.pid) {
            await fs.unlink(lockPath);
        }
    } catch (error: unknown) {
        // Ignore malformed lock file.
        logger.warn(`Failed to release events lock: ${error}`);
    }
}
