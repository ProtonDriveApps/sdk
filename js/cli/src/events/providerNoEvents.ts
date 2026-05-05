/* eslint-disable @typescript-eslint/no-unused-vars */

import type { EventsContext, EventsProvider } from './interface';

/**
 * Never listens and never resumes from stored cursors.
 */
export class NoEventsProvider implements EventsProvider {
    canListenForEvents(): boolean {
        return false;
    }

    getInitialSubscriptionScopeIds(): { context: EventsContext; treeEventScopeIds: string[] }[] {
        return [];
    }

    async getLatestEventId(treeEventScopeId: string): Promise<string | null> {
        return null;
    }

    async setLatestEventId(context: EventsContext, treeEventScopeId: string, eventId: string): Promise<void> {}

    async removeScope(context: EventsContext, treeEventScopeId: string): Promise<void> {}

    async clear(): Promise<void> {}

    async dispose(): Promise<void> {}
}
