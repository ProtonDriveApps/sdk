import { wrapText } from './help';

describe('wrapText', () => {
    it('returns a single empty line for empty input', () => {
        expect(wrapText('', 80)).toEqual(['']);
    });

    it('returns a single empty line for whitespace-only input', () => {
        expect(wrapText('   ', 80)).toEqual(['']);
        expect(wrapText('\n\n', 80)).toEqual(['']);
    });

    it('returns a single line when text fits within the width', () => {
        expect(wrapText('hello world', 80)).toEqual(['hello world']);
    });

    it('trims leading and trailing whitespace', () => {
        expect(wrapText('  hello world  ', 80)).toEqual(['hello world']);
    });

    it('collapses internal whitespace between words', () => {
        expect(wrapText('hello    world', 80)).toEqual(['hello world']);
    });

    it('wraps words onto the next line when they exceed the width', () => {
        expect(wrapText('one two three', 7)).toEqual(['one two', 'three']);
    });

    it('keeps a word longer than the width on its own line', () => {
        expect(wrapText('supercalifragilistic', 5)).toEqual(['supercalifragilistic']);
    });

    it('preserves paragraph breaks as empty lines', () => {
        expect(wrapText('first\n\nsecond', 80)).toEqual(['first', '', 'second']);
    });

    it('wraps each paragraph independently', () => {
        expect(wrapText('aa bb\ncc dd', 3)).toEqual(['aa', 'bb', 'cc', 'dd']);
    });
});
