import path from 'node:path';

import { ValidationError } from '@protontech/drive-sdk';

import {
    assertDownloadDestination,
    assertValidDownloadRoot,
    assertValidPathSegment,
    sanitizePathSegmentForLocalFilesystem,
} from './downloadPathValidation';

describe('downloadPathValidation', () => {
    describe('assertValidDownloadRoot', () => {
        it('returns resolved path for normal folders', () => {
            expect(assertValidDownloadRoot('/home/user/dl')).toBe(path.resolve('/home/user/dl'));
        });

        it('rejects empty string', () => {
            expect(() => assertValidDownloadRoot('   ')).toThrow(new ValidationError('Local folder path must not be empty'));
        });

        it('rejects POSIX filesystem root', () => {
            expect(() => assertValidDownloadRoot('/')).toThrow(new ValidationError('Refusing to use filesystem root as download destination'));
        });
    });

    describe('assertValidPathSegment', () => {
        it('allows typical names', () => {
            expect(() => assertValidPathSegment('report.pdf')).not.toThrow(new ValidationError('Invalid empty path segment'));
            expect(() => assertValidPathSegment('folder name')).not.toThrow(new ValidationError('Invalid empty path segment'));
        });

        it('rejects separators and traversal-like segments', () => {
            expect(() => assertValidPathSegment('a/b')).toThrow(new ValidationError('Invalid character in path segment: "a/b"'));
            expect(() => assertValidPathSegment('..')).toThrow(new ValidationError('Invalid path segment: ".."'));
            expect(() => assertValidPathSegment('.')).toThrow(new ValidationError('Invalid path segment: "."'));
        });

        it('rejects reserved Windows names on win32', () => {
            const prev = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });
            try {
                expect(() => assertValidPathSegment('CON')).toThrow(new ValidationError('Reserved path segment name: "CON"'));
                expect(() => assertValidPathSegment('COM1')).toThrow(new ValidationError('Reserved path segment name: "COM1"'));
            } finally {
                Object.defineProperty(process, 'platform', { value: prev });
            }
        });

        it('allows reserved Windows names on non-win32 platforms', () => {
            if (process.platform === 'win32') {
                return;
            }
            expect(() => assertValidPathSegment('CON')).not.toThrow();
            expect(() => assertValidPathSegment('COM1')).not.toThrow();
        });
    });

    describe('sanitizePathSegmentForLocalFilesystem', () => {
        it('replaces illegal characters with underscores', () => {
            expect(sanitizePathSegmentForLocalFilesystem('bad:name')).toBe('bad_name');
            expect(sanitizePathSegmentForLocalFilesystem('a/b')).toBe('a_b');
        });

        it('preserves segments that do not need sanitization', () => {
            expect(sanitizePathSegmentForLocalFilesystem('a..b')).toBe('a..b');
            expect(sanitizePathSegmentForLocalFilesystem('a.b.c')).toBe('a.b.c');
            expect(sanitizePathSegmentForLocalFilesystem('.hidden')).toBe('.hidden');
            expect(sanitizePathSegmentForLocalFilesystem('report.pdf')).toBe('report.pdf');
            expect(sanitizePathSegmentForLocalFilesystem('folder name')).toBe('folder name');
        });

        it('maps empty, dot, and double-dot segments', () => {
            expect(sanitizePathSegmentForLocalFilesystem('')).toBe('_');
            expect(sanitizePathSegmentForLocalFilesystem('.')).toBe('_');
            expect(sanitizePathSegmentForLocalFilesystem('..')).toBe('__');
        });

        it('prefixes reserved Windows device names on win32', () => {
            const prev = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });
            try {
                expect(sanitizePathSegmentForLocalFilesystem('CON')).toBe('_CON');
                expect(sanitizePathSegmentForLocalFilesystem('COM1')).toBe('_COM1');
            } finally {
                Object.defineProperty(process, 'platform', { value: prev });
            }
        });

        it('does not prefix reserved Windows device names on non-win32 platforms', () => {
            if (process.platform === 'win32') {
                return;
            }
            expect(sanitizePathSegmentForLocalFilesystem('CON')).toBe('CON');
            expect(sanitizePathSegmentForLocalFilesystem('COM1')).toBe('COM1');
        });

        it('produces a segment that passes assertValidPathSegment on current platform', () => {
            const samples = ['bad:name', 'a/b', '', '.', '..', 'CON', 'COM1', 'ok.txt', ':::'];
            for (const s of samples) {
                expect(() => assertValidPathSegment(sanitizePathSegmentForLocalFilesystem(s))).not.toThrow();
            }
        });

        it('replaces trailing dots and spaces on Windows', () => {
            const prev = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });
            try {
                expect(sanitizePathSegmentForLocalFilesystem('file.')).toBe('file_');
                expect(sanitizePathSegmentForLocalFilesystem('file ')).toBe('file_');
            } finally {
                Object.defineProperty(process, 'platform', { value: prev });
            }
        });
    });

    describe('assertDownloadDestination', () => {
        const root = path.resolve('/safe/root');

        it('allows paths inside root', () => {
            expect(() =>
                assertDownloadDestination(root, path.join(root, 'sub', 'file.txt')),
            ).not.toThrow();
        });

        it('allows destination equal to root', () => {
            expect(() => assertDownloadDestination(root, root)).not.toThrow();
        });

        it('rejects paths outside root', () => {
            expect(() => assertDownloadDestination(root, '/etc/passwd')).toThrow(new ValidationError('Download path escapes destination folder: /etc/passwd'));
        });
    });
});
