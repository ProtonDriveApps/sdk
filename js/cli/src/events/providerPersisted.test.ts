import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

import { tryAcquireEventsLock } from './lock';
import { PersistedEventsProvider } from './providerPersisted';
import { EVENTS_FILE, EventsFileStore } from './storage';

async function tempDir(): Promise<string> {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'drive-cli-events-persisted-'));
}

function eventsJsonFile(dir: string): string {
    return path.join(dir, EVENTS_FILE);
}

describe('PersistedEventsProvider', () => {
    const logger = getMockLogger();

    it('setLatestEventId flushes data to disk', async () => {
        const dir = await tempDir();
        expect(await tryAcquireEventsLock(dir)).toBe(true);
        const store = await EventsFileStore.load(dir);
        // @ts-expect-error - private constructor
        const p = new PersistedEventsProvider(logger, dir, store, true);
        await p.setLatestEventId('drive', 'scope', 'id1');
        const disk = JSON.parse(await fs.readFile(eventsJsonFile(dir), 'utf8'));
        expect(disk.drive.scope.lastEventId).toBe('id1');
        await p.dispose();
    });

    it('removeScope flushes data to disk', async () => {
        const dir = await tempDir();
        expect(await tryAcquireEventsLock(dir)).toBe(true);
        const store = await EventsFileStore.load(dir);
        // @ts-expect-error - private constructor
        const p = new PersistedEventsProvider(logger, dir, store, true);
        await p.setLatestEventId('drive', 'a', '1');
        await p.setLatestEventId('drive', 'b', '2');
        await p.removeScope('drive', 'a');
        const disk = JSON.parse(await fs.readFile(eventsJsonFile(dir), 'utf8'));
        expect(disk.drive.a).toBeUndefined();
        expect(disk.drive.b.lastEventId).toBe('2');
        await p.dispose();
    });
});

describe('PersistedEventsProvider.open', () => {
    const logger = getMockLogger();

    it('listens when lock acquired and persists', async () => {
        const dir = await tempDir();
        const p = await PersistedEventsProvider.open(logger, dir);
        expect(p.canListenForEvents()).toBe(true);
        await p.setLatestEventId('photos', 'scope', 'id1');
        const disk = JSON.parse(await fs.readFile(eventsJsonFile(dir), 'utf8'));
        expect(disk.photos.scope.lastEventId).toBe('id1');
        await p.dispose();
    });

    it('does not listen when lock held', async () => {
        const dir = await tempDir();
        const first = await PersistedEventsProvider.open(logger, dir);
        expect(first.canListenForEvents()).toBe(true);
        const second = await PersistedEventsProvider.open(logger, dir);
        expect(second.canListenForEvents()).toBe(false);
        expect(await second.getLatestEventId('scope')).toBeNull();
        expect(second.getInitialSubscriptionScopeIds()).toEqual([]);
        await first.dispose();
    });

    it('exposes scope ids from events.json for load-time subscribe', async () => {
        const dir = await tempDir();
        await fs.writeFile(
            eventsJsonFile(dir),
            JSON.stringify({
                version: 1,
                drive: { volA: { lastEventId: '1' }, volB: { lastEventId: '2' } },
                photos: {},
            }),
            'utf8',
        );
        const p = await PersistedEventsProvider.open(logger, dir);
        expect(p.getInitialSubscriptionScopeIds()).toEqual([
            { context: 'drive', treeEventScopeIds: expect.arrayContaining(['volA', 'volB']) },
        ]);
        const driveIds = p.getInitialSubscriptionScopeIds()[0].treeEventScopeIds.sort();
        expect(driveIds).toEqual(['volA', 'volB']);
        await p.dispose();
    });

    it('migrates legacy scopes file for initial subscribe', async () => {
        const dir = await tempDir();
        await fs.writeFile(
            eventsJsonFile(dir),
            JSON.stringify({
                version: 1,
                scopes: { volA: { lastEventId: '1' } },
            }),
            'utf8',
        );
        const p = await PersistedEventsProvider.open(logger, dir);
        expect(p.getInitialSubscriptionScopeIds()).toEqual([
            { context: 'drive', treeEventScopeIds: ['volA'] },
        ]);
        await p.dispose();
    });
});
