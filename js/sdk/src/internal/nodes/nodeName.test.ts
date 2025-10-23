import { splitExtension, joinNameAndExtension } from './nodeName';

describe('nodeName', () => {
    describe('splitExtension', () => {
        it('should handle empty string', () => {
            const result = splitExtension('');
            expect(result).toEqual(['', '']);
        });

        it('should split filename with extension correctly', () => {
            const result = splitExtension('document.pdf');
            expect(result).toEqual(['document', 'pdf']);
        });

        it('should handle filename without extension', () => {
            const result = splitExtension('folder');
            expect(result).toEqual(['folder', '']);
        });

        it('should split filename with multiple dots correctly', () => {
            const result = splitExtension('my.file.name.txt');
            expect(result).toEqual(['my.file.name', 'txt']);
        });

        it('should handle filename ending with dot', () => {
            const result = splitExtension('dot.');
            expect(result).toEqual(['dot.', '']);
        });

        it('should handle filename with only extension', () => {
            const result = splitExtension('.gitignore');
            expect(result).toEqual(['.gitignore', '']);
        });
    });

    describe('joinNameAndExtension', () => {
        it('should join name, index, and extension correctly', () => {
            const result = joinNameAndExtension('document', 1, 'pdf');
            expect(result).toBe('document (1).pdf');
        });

        it('should handle empty name with extension', () => {
            const result = joinNameAndExtension('', 2, 'txt');
            expect(result).toBe('(2).txt');
        });

        it('should handle name with empty extension', () => {
            const result = joinNameAndExtension('document', 3, '');
            expect(result).toBe('document (3)');
        });

        it('should handle both name and extension empty', () => {
            const result = joinNameAndExtension('', 4, '');
            expect(result).toBe('(4)');
        });
    });
});
