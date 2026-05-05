import type { EventsContext, EventsProvider } from './interface';

export class MemoryEventsProvider implements EventsProvider {
    private readonly lastByContext: Record<EventsContext, Map<string, string>> = {
        drive: new Map(),
        photos: new Map(),
    };

    canListenForEvents(): boolean {
        return true;
    }

    getInitialSubscriptionScopeIds(): { context: EventsContext; treeEventScopeIds: string[] }[] {
        const out: { context: EventsContext; treeEventScopeIds: string[] }[] = [];
        for (const context of ['drive', 'photos'] as const) {
            const ids = [...this.lastByContext[context].keys()];
            if (ids.length > 0) {
                out.push({ context, treeEventScopeIds: ids });
            }
        }
        return out;
    }

    async getLatestEventId(treeEventScopeId: string): Promise<string | null> {
        return (
            this.lastByContext.drive.get(treeEventScopeId) ?? this.lastByContext.photos.get(treeEventScopeId) ?? null
        );
    }

    async setLatestEventId(context: EventsContext, treeEventScopeId: string, eventId: string): Promise<void> {
        this.lastByContext[context].set(treeEventScopeId, eventId);
    }

    async removeScope(context: EventsContext, treeEventScopeId: string): Promise<void> {
        this.lastByContext[context].delete(treeEventScopeId);
    }

    async clear(): Promise<void> {
        this.lastByContext.drive.clear();
        this.lastByContext.photos.clear();
    }

    async dispose(): Promise<void> {}
}
