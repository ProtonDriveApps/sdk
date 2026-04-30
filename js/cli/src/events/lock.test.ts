import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

import { EVENTS_LOCK_FILE, releaseEventsLock, tryAcquireEventsLock } from './lock';

async function tempDir(): Promise<string> {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'drive-cli-events-lock'));
}

function eventsLockFile(dir: string): string {
    return path.join(dir, EVENTS_LOCK_FILE);
}

describe('lock', () => {
    const logger = getMockLogger();

    it('acquires when free', async () => {
        const dir = await tempDir();
        expect(await tryAcquireEventsLock(dir)).toBe(true);
    });

    it('returns false when live holder', async () => {
        const dir = await tempDir();
        expect(await tryAcquireEventsLock(dir)).toBe(true);
        expect(await tryAcquireEventsLock(dir)).toBe(false);
    });

    it('replaces stale pid', async () => {
        const dir = await tempDir();
        await fs.writeFile(eventsLockFile(dir), JSON.stringify({ pid: 999_999_999 }), 'utf8');
        expect(await tryAcquireEventsLock(dir)).toBe(true);
    });

    it('release removes own lock', async () => {
        const dir = await tempDir();
        await tryAcquireEventsLock(dir);
        await releaseEventsLock(logger, dir);
        await expect(fs.readFile(eventsLockFile(dir))).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
