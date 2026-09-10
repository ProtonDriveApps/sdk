import { ValidationError } from '@protontech/drive-sdk';

jest.mock('../../cli', () => ({
    ...jest.requireActual('../../cli/node'),
    printObject: jest.fn(),
}));
jest.mock('../fileSystem/transferProgress', () => ({
    createTransferProgress: jest.fn(),
}));

import { parseSections } from './commandTakeoutRun';

describe('parseSections', () => {
    it('appends repeated options', () => {
        expect(parseSections(['my-files', 'devices'])).toEqual(new Set(['my-files', 'devices']));
    });

    it('rejects an empty selection', () => {
        expect(() => parseSections([])).toThrow(ValidationError);
        expect(() => parseSections([])).toThrow(/Available sections/);
    });

    it('rejects an unknown section', () => {
        expect(() => parseSections(['trash'])).toThrow(/Unknown section "trash"/);
    });

    it('rejects revisions without a section it can modify', () => {
        expect(() => parseSections(['revisions'])).toThrow(/also requires/);
    });

    it('accepts revisions together with my-files or devices', () => {
        expect(parseSections(['my-files', 'revisions'])).toEqual(new Set(['my-files', 'revisions']));
        expect(parseSections(['devices', 'revisions'])).toEqual(new Set(['devices', 'revisions']));
    });
});
