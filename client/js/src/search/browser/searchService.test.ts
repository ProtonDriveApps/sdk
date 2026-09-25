import { getSearchWorkerNameForTesting } from './searchService';

describe('getSearchWorkerName', () => {
    it('scopes the name by SDK version and user id', () => {
        expect(getSearchWorkerNameForTesting('1.2.3', 'address-id')).toBe('proton-drive-search:1.2.3:address-id');
    });

    it('produces different names for different versions or users', () => {
        const base = getSearchWorkerNameForTesting('1.0.0', 'user-a');
        expect(getSearchWorkerNameForTesting('2.0.0', 'user-a')).not.toBe(base);
        expect(getSearchWorkerNameForTesting('1.0.0', 'user-b')).not.toBe(base);
    });
});
