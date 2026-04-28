import path from 'node:path';

import { ValidationError } from '@protontech/drive-sdk';

import {
    assertDownloadDestination,
    assertValidDownloadRoot,
    assertValidPathSegment,
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

        it('rejects reserved Windows names', () => {
            expect(() => assertValidPathSegment('CON')).toThrow(new ValidationError('Reserved path segment name: "CON"'));
            expect(() => assertValidPathSegment('COM1')).toThrow(new ValidationError('Reserved path segment name: "COM1"'));
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
