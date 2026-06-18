import { MemoryEventsProvider } from './providerMemory';

describe('MemoryEventsProvider', () => {
    it('round-trips set and get per context', async () => {
        const p = new MemoryEventsProvider();
        await p.setLatestEventId('drive', 'scopeId', 'eventId');
        expect(await p.getLatestEventId('scopeId')).toBe('eventId');
        expect(p.getInitialSubscriptionScopeIds()).toEqual([
            { context: 'drive', treeEventScopeIds: ['scopeId'] },
        ]);

        await p.removeScope('drive', 'scopeId');
        expect(await p.getLatestEventId('scopeId')).toBeNull();
        expect(p.getInitialSubscriptionScopeIds()).toEqual([]);
    });

    it('keeps drive and photos scopes separate', async () => {
        const p = new MemoryEventsProvider();
        await p.setLatestEventId('drive', 'same', 'd1');
        await p.setLatestEventId('photos', 'same', 'p1');
        expect(await p.getLatestEventId('same')).toBe('d1');
        expect(p.getInitialSubscriptionScopeIds()).toEqual([
            { context: 'drive', treeEventScopeIds: ['same'] },
            { context: 'photos', treeEventScopeIds: ['same'] },
        ]);
    });
});
