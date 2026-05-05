import { Logger } from '@protontech/drive-sdk';

import type { EventsContext, EventsProvider } from './interface';
import { releaseEventsLock, tryAcquireEventsLock } from './lock';
import { EventsFileStore } from './storage';

/**
 * Persisted event provider that stores the last event ID in `events.json`,
 * gated by `events.lock`. Only one process can hold the lock at a time.
 */
export class PersistedEventsProvider implements EventsProvider {
    private constructor(
        private readonly logger: Logger,
        private readonly cacheDir: string,
        private readonly store: EventsFileStore,
        private readonly holdsLock: boolean,
    ) {}

    static async open(logger: Logger, cacheDir: string): Promise<PersistedEventsProvider> {
        const lockingResult = await tryAcquireEventsLock(cacheDir);
        if (!lockingResult) {
            return new PersistedEventsProvider(logger, cacheDir, EventsFileStore.empty(cacheDir), false);
        }
        const store = await EventsFileStore.load(cacheDir);
        return new PersistedEventsProvider(logger, cacheDir, store, true);
    }

    canListenForEvents(): boolean {
        return this.holdsLock;
    }

    getInitialSubscriptionScopeIds(): { context: EventsContext; treeEventScopeIds: string[] }[] {
        if (!this.holdsLock) {
            return [];
        }
        return this.store.getInitialSubscriptionScopeIds();
    }

    async getLatestEventId(treeEventScopeId: string): Promise<string | null> {
        if (!this.holdsLock) {
            return null;
        }
        return (
            this.store.getLatestEventId('drive', treeEventScopeId) ??
            this.store.getLatestEventId('photos', treeEventScopeId) ??
            null
        );
    }

    async setLatestEventId(context: EventsContext, treeEventScopeId: string, eventId: string): Promise<void> {
        if (!this.holdsLock) {
            return;
        }
        this.store.setLatestEventId(context, treeEventScopeId, eventId);
        await this.store.flush();
    }

    async removeScope(context: EventsContext, treeEventScopeId: string): Promise<void> {
        if (!this.holdsLock) {
            return;
        }
        this.store.removeScope(context, treeEventScopeId);
        await this.store.flush();
    }

    async clear(): Promise<void> {
        await this.store.clear();
    }

    async dispose(): Promise<void> {
        if (this.holdsLock) {
            await releaseEventsLock(this.logger, this.cacheDir);
        }
    }
}
