import fs from 'node:fs/promises';
import path from 'node:path';

import type { EventsContext } from './interface';

export const EVENTS_FILE = 'events.json';

type EventsScopeEntry = {
    lastEventId: string;
};

type EventsScopes = {
    // WARNING
    // When we need to change the format, we need to add migration logic, or
    // drop the old cache. At this moment, it just starts over with an empty
    // document and skips events from the previous version.
    version: 1;
    drive: Record<string, EventsScopeEntry>;
    photos: Record<string, EventsScopeEntry>;
};

export class EventsFileStore {
    private constructor(
        private readonly cacheDir: string,
        private scopes: EventsScopes,
    ) {}

    static empty(cacheDir: string): EventsFileStore {
        return new EventsFileStore(cacheDir, emptyEventsDocument());
    }

    static async load(cacheDir: string): Promise<EventsFileStore> {
        try {
            const content = await fs.readFile(eventsJsonPath(cacheDir), 'utf8');
            return new EventsFileStore(cacheDir, parseEventsDocument(content));
        } catch {
            return new EventsFileStore(cacheDir, emptyEventsDocument());
        }
    }

    getScopeIds(context: EventsContext): string[] {
        return Object.keys(this.scopes[context]);
    }

    getInitialSubscriptionScopeIds(): { context: EventsContext; treeEventScopeIds: string[] }[] {
        const out: { context: EventsContext; treeEventScopeIds: string[] }[] = [];
        for (const context of ['drive', 'photos'] as const) {
            const ids = this.getScopeIds(context);
            if (ids.length > 0) {
                out.push({ context, treeEventScopeIds: ids });
            }
        }
        return out;
    }

    getLatestEventId(context: EventsContext, scopeId: string): string | undefined {
        return this.scopes[context][scopeId]?.lastEventId;
    }

    setLatestEventId(context: EventsContext, scopeId: string, lastEventId: string): void {
        this.scopes[context][scopeId] = { lastEventId };
    }

    removeScope(context: EventsContext, scopeId: string): void {
        delete this.scopes[context][scopeId];
    }

    async flush(): Promise<void> {
        const filePath = eventsJsonPath(this.cacheDir);
        const body = JSON.stringify(this.scopes, null, 2);
        await fs.writeFile(filePath, body, 'utf8');
    }

    async clear(): Promise<void> {
        await fs.unlink(eventsJsonPath(this.cacheDir));
    }
}

function eventsJsonPath(cacheDir: string): string {
    return path.join(cacheDir, EVENTS_FILE);
}

function parseScopeRecordMap(value: unknown): Record<string, EventsScopeEntry> {
    if (typeof value !== 'object' || value === null) {
        return {};
    }
    const out: Record<string, EventsScopeEntry> = {};
    for (const [scopeId, entry] of Object.entries(value)) {
        if (
            entry &&
            typeof entry === 'object' &&
            typeof (entry as { lastEventId?: unknown }).lastEventId === 'string'
        ) {
            out[scopeId] = { lastEventId: (entry as { lastEventId: string }).lastEventId };
        }
    }
    return out;
}

function parseEventsDocument(content: string): EventsScopes {
    try {
        const raw = JSON.parse(content) as unknown;
        if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) {
            return emptyEventsDocument();
        }

        const driveRaw = (raw as { drive?: unknown }).drive;
        const photosRaw = (raw as { photos?: unknown }).photos;
        const legacyScopes = (raw as { scopes?: unknown }).scopes;

        const hasNewShape =
            (typeof driveRaw === 'object' && driveRaw !== null) ||
            (typeof photosRaw === 'object' && photosRaw !== null);

        if (hasNewShape) {
            return {
                version: 1,
                drive: parseScopeRecordMap(driveRaw),
                photos: parseScopeRecordMap(photosRaw),
            };
        }

        if (typeof legacyScopes === 'object' && legacyScopes !== null) {
            return {
                version: 1,
                drive: parseScopeRecordMap(legacyScopes),
                photos: {},
            };
        }

        return emptyEventsDocument();
    } catch {
        return emptyEventsDocument();
    }
}

function emptyEventsDocument(): EventsScopes {
    return { version: 1, drive: {}, photos: {} };
}
