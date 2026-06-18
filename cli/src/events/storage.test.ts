import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EVENTS_FILE, EventsFileStore } from './storage';

async function tempDir(): Promise<string> {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'drive-cli-events-storage-'));
}

function eventsJsonFile(dir: string): string {
    return path.join(dir, EVENTS_FILE);
}

describe('EventsFileStore', () => {
    it('yields empty document for invalid JSON on disk', async () => {
        const dir = await tempDir();
        await fs.writeFile(eventsJsonFile(dir), '', 'utf8');
        const store = await EventsFileStore.load(dir);
        expect(store.getScopeIds('drive')).toEqual([]);
        expect(store.getScopeIds('photos')).toEqual([]);
    });

    it('reads v1 drive/photos from disk', async () => {
        const dir = await tempDir();
        await fs.writeFile(
            eventsJsonFile(dir),
            JSON.stringify({
                version: 1,
                drive: { a: { lastEventId: '1' } },
                photos: { b: { lastEventId: '2' } },
            }),
            'utf8',
        );
        const store = await EventsFileStore.load(dir);
        expect(store.getLatestEventId('drive', 'a')).toBe('1');
        expect(store.getLatestEventId('photos', 'b')).toBe('2');
        expect(store.getLatestEventId('drive', 'b')).toBeUndefined();
    });

    it('migrates legacy scopes into drive', async () => {
        const dir = await tempDir();
        await fs.writeFile(
            eventsJsonFile(dir),
            JSON.stringify({
                version: 1,
                scopes: { a: { lastEventId: '1' } },
            }),
            'utf8',
        );
        const store = await EventsFileStore.load(dir);
        expect(store.getLatestEventId('drive', 'a')).toBe('1');
        expect(store.getScopeIds('photos')).toEqual([]);
    });

    it('getScopeIds returns persisted keys per context', () => {
        const dir = 'unused-for-path';
        const store = EventsFileStore.empty(dir);
        store.setLatestEventId('drive', 'a', '1');
        store.setLatestEventId('drive', 'b', '2');
        store.setLatestEventId('photos', 'c', '3');
        expect(store.getScopeIds('drive').sort()).toEqual(['a', 'b']);
        expect(store.getScopeIds('photos')).toEqual(['c']);
    });

    it('writes to empty events.json with drive and photos', async () => {
        const dir = await tempDir();
        const store = EventsFileStore.empty(dir);
        store.setLatestEventId('drive', 'scopeId', 'eventId');
        await store.flush();
        const raw = JSON.parse(await fs.readFile(eventsJsonFile(dir), 'utf8'));
        expect(raw.version).toBe(1);
        expect(raw.drive.scopeId.lastEventId).toBe('eventId');
        expect(raw.photos).toEqual({});
    });

    it('load reads flushed data', async () => {
        const dir = await tempDir();
        const a = EventsFileStore.empty(dir);
        a.setLatestEventId('photos', 'x', 'y');
        await a.flush();
        const b = await EventsFileStore.load(dir);
        expect(b.getLatestEventId('photos', 'x')).toBe('y');
    });
});
