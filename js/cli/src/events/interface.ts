import type { LatestEventIdProvider } from '@protontech/drive-sdk';

export type EventsContext = 'drive' | 'photos';

export interface EventsProvider extends LatestEventIdProvider {
    canListenForEvents(): boolean;
    getInitialSubscriptionScopeIds(): { context: EventsContext; treeEventScopeIds: string[] }[];
    setLatestEventId(context: EventsContext, treeEventScopeId: string, eventId: string): Promise<void>;
    removeScope(context: EventsContext, treeEventScopeId: string): Promise<void>;
    clear(): Promise<void>;
    dispose(): Promise<void>;
}
