import { ValidationError } from '../../../errors';
import { getTokenAndPasswordFromUrl } from './url';

describe('getTokenAndPasswordFromUrl', () => {
    describe('valid URLs', () => {
        it('should extract token and password from a valid URL', () => {
            const url = 'https://drive.proton.me/urls/abc123#def456';
            const result = getTokenAndPasswordFromUrl(url);

            expect(result).toEqual({
                token: 'abc123',
                password: 'def456',
            });
        });

        it('should handle URLs with different domains', () => {
            const url = 'https://example.com/urls/mytoken#mypassword';
            const result = getTokenAndPasswordFromUrl(url);

            expect(result).toEqual({
                token: 'mytoken',
                password: 'mypassword',
            });
        });

        it('should handle URLs with query parameters', () => {
            const url = 'https://drive.proton.me/urls/token123?param=value#password456';
            const result = getTokenAndPasswordFromUrl(url);

            expect(result).toEqual({
                token: 'token123',
                password: 'password456',
            });
        });
    });

    describe('should throw ValidationError', () => {
        it('when token is missing (no path)', () => {
            const url = 'https://drive.proton.me/#password123';

            expect(() => getTokenAndPasswordFromUrl(url)).toThrow(ValidationError);
        });

        it('when token is missing (empty path segment)', () => {
            const url = 'https://drive.proton.me/urls/#password123';

            expect(() => getTokenAndPasswordFromUrl(url)).toThrow(ValidationError);
        });

        it('when password is missing (no hash)', () => {
            const url = 'https://drive.proton.me/urls/token123';

            expect(() => getTokenAndPasswordFromUrl(url)).toThrow(ValidationError);
            expect(() => getTokenAndPasswordFromUrl(url)).toThrow('Invalid URL');
        });

        it('when password is empty (empty hash)', () => {
            const url = 'https://drive.proton.me/urls/token123#';

            expect(() => getTokenAndPasswordFromUrl(url)).toThrow(ValidationError);
            expect(() => getTokenAndPasswordFromUrl(url)).toThrow('Invalid URL');
        });

        it('for empty string', () => {
            expect(() => getTokenAndPasswordFromUrl('')).toThrow();
        });

        it('for invalid URL format', () => {
            expect(() => getTokenAndPasswordFromUrl('not-a-url')).toThrow();
        });
    });
});
