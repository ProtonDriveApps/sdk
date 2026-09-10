import { readdir } from 'node:fs/promises';

import { NameRegistry } from './nameRegistry';

jest.mock('node:fs/promises', () => ({
    readdir: jest.fn(),
}));

const readdirMock = readdir as jest.MockedFunction<typeof readdir>;

describe('NameRegistry', () => {
    it('keeps the first name and deduplicates the following ones before the extension', () => {
        const registry = new NameRegistry();

        expect(registry.allocate('IMG_0042.HEIC')).toBe('IMG_0042.HEIC');
        expect(registry.allocate('IMG_0042.HEIC')).toBe('IMG_0042 (2).HEIC');
        expect(registry.allocate('IMG_0042.HEIC')).toBe('IMG_0042 (3).HEIC');
    });

    it('deduplicates names without an extension', () => {
        const registry = new NameRegistry();

        expect(registry.allocate('MacBook')).toBe('MacBook');
        expect(registry.allocate('MacBook')).toBe('MacBook (2)');
    });

    it('sanitizes characters that are invalid in a local name', () => {
        const registry = new NameRegistry();

        expect(registry.allocate('in/valid:name.txt')).toBe('in_valid_name.txt');
    });

    it('deduplicates names differing only in case', () => {
        const registry = new NameRegistry();

        expect(registry.allocate('notes.txt')).toBe('notes.txt');
        expect(registry.allocate('Notes.txt')).toBe('Notes (2).txt');
    });

    it('reserves the manifest name', () => {
        const registry = new NameRegistry();

        expect(registry.allocate('manifest.json')).toBe('manifest (2).json');
    });

    it('allocates a content file together with its manifest', () => {
        const registry = new NameRegistry();

        expect(registry.allocateFileWithManifest('notes.txt')).toEqual({
            name: 'notes.txt',
            manifestName: 'notes.txt.manifest.json',
        });
    });

    it('never lets a file manifest overwrite a content file of the same name', () => {
        const registry = new NameRegistry();

        expect(registry.allocateFileWithManifest('notes.txt.manifest.json').name).toBe('notes.txt.manifest.json');
        // `notes.txt` is free, but its manifest name is already taken by the file above.
        expect(registry.allocateFileWithManifest('notes.txt')).toEqual({
            name: 'notes (2).txt',
            manifestName: 'notes (2).txt.manifest.json',
        });
    });

    it('avoids names already present in the destination folder', async () => {
        readdirMock.mockResolvedValue(['report.pdf'] as unknown as Awaited<ReturnType<typeof readdir>>);

        const registry = await NameRegistry.createForFolder('/takeout/my-files');

        expect(registry.allocate('report.pdf')).toBe('report (2).pdf');
    });

    it('starts empty when the destination folder does not exist yet', async () => {
        readdirMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

        const registry = await NameRegistry.createForFolder('/takeout/my-files');

        expect(registry.allocate('report.pdf')).toBe('report.pdf');
    });

    it('fails when the destination folder cannot be listed', async () => {
        readdirMock.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

        await expect(NameRegistry.createForFolder('/takeout/my-files')).rejects.toThrow('EACCES');
    });
});
