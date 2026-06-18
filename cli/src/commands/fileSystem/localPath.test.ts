import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ValidationError } from '@protontech/drive-sdk';

import { resolveLocalPaths } from './localPath';

describe('localPath', () => {
    describe('resolveLocalPaths', () => {
        it('resolves a non-glob path to a single absolute path', async () => {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-cli-local-path-'));
            const file = path.join(dir, 'plain.txt');
            await fs.writeFile(file, 'x');

            const result = await resolveLocalPaths(file);
            expect(result).toEqual([path.resolve(file)]);
        });

        it('expands ~ to the user home directory', async () => {
            const result = await resolveLocalPaths('~');
            expect(result).toEqual([path.resolve(os.homedir())]);
        });

        it('expands ~/ to a path under the home directory', async () => {
            const result = await resolveLocalPaths('~/');
            expect(result).toEqual([path.resolve(path.join(os.homedir(), ''))]);
        });

        it('expands ~/segment under the home directory', async () => {
            const result = await resolveLocalPaths('~/Library');
            expect(result).toEqual([path.resolve(path.join(os.homedir(), 'Library'))]);
        });

        it('expands ~\\segment under the home directory', async () => {
            const result = await resolveLocalPaths('~\\Library');
            expect(result).toEqual([path.resolve(path.join(os.homedir(), 'Library'))]);
        });

        it('expands a glob to sorted absolute matches', async () => {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-cli-local-path-glob-'));
            await fs.writeFile(path.join(dir, 'b.txt'), 'b');
            await fs.writeFile(path.join(dir, 'a.txt'), 'a');

            const pattern = path.join(dir, '*.txt');
            const result = await resolveLocalPaths(pattern);

            const expectedA = path.resolve(path.join(dir, 'a.txt'));
            const expectedB = path.resolve(path.join(dir, 'b.txt'));
            expect(result).toEqual([expectedA, expectedB]);
        });

        it('throws when a glob matches nothing', async () => {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-cli-local-path-empty-glob-'));
            const pattern = path.join(dir, 'no-such-*.txt');

            await expect(resolveLocalPaths(pattern)).rejects.toThrow(
                new ValidationError(`No paths matched: ${pattern}`),
            );
        });
    });
});
