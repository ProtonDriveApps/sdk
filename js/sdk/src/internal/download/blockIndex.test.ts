import { DEFAULT_FILE_CHUNK_SIZE, getBlockIndex } from './blockIndex';

describe('getBlockIndex', () => {
    describe('default behavior (no claimedBlockSize)', () => {
        it('should handle position 0', () => {
            const result = getBlockIndex(undefined, 0);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 1,
                    blockOffset: 0,
                },
            });
        });

        it('should handle position within first block', () => {
            const position = 1024; // 1KB
            const result = getBlockIndex(undefined, position);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 1,
                    blockOffset: 1024,
                },
            });
        });

        it('should handle position at exact block boundary', () => {
            const position = DEFAULT_FILE_CHUNK_SIZE; // Exactly 4MB
            const result = getBlockIndex(undefined, position);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 2,
                    blockOffset: 0,
                },
            });
        });

        it('should handle position in second block', () => {
            const position = DEFAULT_FILE_CHUNK_SIZE + 1024; // 4MB + 1KB
            const result = getBlockIndex(undefined, position);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 2,
                    blockOffset: 1024,
                },
            });
        });
    });

    describe('default behavior (empty claimedBlockSize)', () => {
        it('should handle empty array like undefined', () => {
            const position = DEFAULT_FILE_CHUNK_SIZE + 1024;
            const result = getBlockIndex([], position);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 2,
                    blockOffset: 1024,
                },
            });
        });
    });

    describe('variable block sizes', () => {
        const claimedBlockSizes = [1024, 2048, 4096]; // 1KB, 2KB, 4KB blocks

        it('should handle position in first block of custom sizes', () => {
            const result = getBlockIndex(claimedBlockSizes, 512);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 1,
                    blockOffset: 512,
                },
            });
        });

        it('should handle position at exact first block boundary', () => {
            const result = getBlockIndex(claimedBlockSizes, 1024);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 2,
                    blockOffset: 0,
                },
            });
        });

        it('should handle position in second block', () => {
            const result = getBlockIndex(claimedBlockSizes, 1024 + 512);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 2,
                    blockOffset: 512,
                },
            });
        });

        it('should handle position at second block boundary', () => {
            const result = getBlockIndex(claimedBlockSizes, 1024 + 2048);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 3,
                    blockOffset: 0,
                },
            });
        });

        it('should handle position in third block', () => {
            const result = getBlockIndex(claimedBlockSizes, 1024 + 2048 + 1000);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 3,
                    blockOffset: 1000,
                },
            });
        });

        it('should handle position at very end of last block', () => {
            const result = getBlockIndex(claimedBlockSizes, 1024 + 2048 + 4096 - 1);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 3,
                    blockOffset: 4095,
                },
            });
        });

        it('should handle zero-sized blocks mixed with normal blocks', () => {
            const claimedBlockSizes = [0, 1000, 0, 2000];
            const result = getBlockIndex(claimedBlockSizes, 500);
            expect(result).toEqual({
                done: false,
                value: {
                    blockIndex: 2,
                    blockOffset: 500,
                },
            });
        });

        it('should throw error when position is beyond file with custom block sizes', () => {
            const claimedBlockSizes = [1024, 2048, 4096];
            const totalSize = 1024 + 2048 + 4096;
            const result = getBlockIndex(claimedBlockSizes, totalSize);
            expect(result).toEqual({
                done: true,
                value: undefined,
            });
        });
    });
});
