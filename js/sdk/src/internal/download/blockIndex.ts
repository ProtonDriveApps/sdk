export const DEFAULT_FILE_CHUNK_SIZE = 4 * 1024 * 1024;

export function getBlockIndex(
    claimedBlockSizes: number[] | undefined,
    position: number,
): { done: false; value: { blockIndex: number; blockOffset: number } } | { done: true; value: undefined } {
    if (!claimedBlockSizes || claimedBlockSizes.length === 0) {
        return {
            value: {
                blockIndex: Math.floor(position / DEFAULT_FILE_CHUNK_SIZE) + 1,
                blockOffset: position % DEFAULT_FILE_CHUNK_SIZE,
            },
            done: false,
        };
    }

    let currentPosition = 0;
    for (let i = 0; i < claimedBlockSizes.length; i++) {
        const blockSize = claimedBlockSizes[i];
        if (position < currentPosition + blockSize) {
            return {
                value: {
                    blockIndex: i + 1,
                    blockOffset: position - currentPosition,
                },
                done: false,
            };
        }
        currentPosition += blockSize;
    }

    return {
        value: undefined,
        done: true,
    };
}
