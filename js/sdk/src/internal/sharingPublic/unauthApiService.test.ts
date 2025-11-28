import { getUnauthEndpoint } from './unauthApiService';

describe('getUnauthEndpoint', () => {
    it('should not change urls endpoints', () => {
        expect(getUnauthEndpoint('drive/urls/anything')).toBe('drive/urls/anything');
        expect(getUnauthEndpoint('drive/urls/drive/anything')).toBe('drive/urls/drive/anything');
        expect(getUnauthEndpoint('drive/urls/drive/v2/anything')).toBe('drive/urls/drive/v2/anything');
    });

    it('should not change v2/urls endpoints', () => {
        expect(getUnauthEndpoint('drive/v2/urls/anything')).toBe('drive/v2/urls/anything');
        expect(getUnauthEndpoint('drive/v2/urls/drive/anything')).toBe('drive/v2/urls/drive/anything');
        expect(getUnauthEndpoint('drive/v2/urls/drive/v2/anything')).toBe('drive/v2/urls/drive/v2/anything');
    });

    it('should put unauth prefix for v2 endpoints', () => {
        expect(getUnauthEndpoint('drive/v2/anything')).toBe('drive/unauth/v2/anything');
        expect(getUnauthEndpoint('drive/v2/drive/anything')).toBe('drive/unauth/v2/drive/anything');
        expect(getUnauthEndpoint('drive/v2/drive/v2/anything')).toBe('drive/unauth/v2/drive/v2/anything');
    });

    it('should put unauth prefix for non-v2 endpoints', () => {
        expect(getUnauthEndpoint('drive/anything')).toBe('drive/unauth/anything');
        expect(getUnauthEndpoint('drive/anything/v2/anything')).toBe('drive/unauth/anything/v2/anything');
        expect(getUnauthEndpoint('drive/anything/drive/anything')).toBe('drive/unauth/anything/drive/anything');
        expect(getUnauthEndpoint('drive/anything/drive/v2/anything')).toBe('drive/unauth/anything/drive/v2/anything');
    });
});

