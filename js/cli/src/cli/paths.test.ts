import { pathBasename, pathDirname, splitPathSegments } from './paths';

describe('pathDirname', () => {
    it('returns the parent path with slashes re-escaped in segment names', () => {
        expect(pathDirname('/my-files/foo\\/bar/baz')).toBe('/my-files/foo\\/bar');
    });
});

describe('pathBasename', () => {
    it('returns the last segment with escapes decoded', () => {
        expect(pathBasename('/my-files/foo\\/bar')).toBe('foo/bar');
    });
});

describe('splitPathSegments', () => {
    it('splits on unescaped slashes', () => {
        expect(splitPathSegments('/my-files/foo/bar')).toEqual(['', 'my-files', 'foo', 'bar']);
    });

    it('treats escaped slash as part of the segment name', () => {
        expect(splitPathSegments('/my-files/foo\\/bar/baz')).toEqual(['', 'my-files', 'foo/bar', 'baz']);
    });

    it('treats escaped backslash as a literal backslash', () => {
        expect(splitPathSegments('/my-files/foo\\bar')).toEqual(['', 'my-files', 'foo\\bar']);
    });

    it('leaves a trailing backslash literal when not escaping', () => {
        expect(splitPathSegments('/my-files/foo\\')).toEqual(['', 'my-files', 'foo\\']);
    });
});
