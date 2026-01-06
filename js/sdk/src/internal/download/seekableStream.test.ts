import { SeekableReadableStream, BufferedSeekableStream, UnderlyingSeekableSource } from './seekableStream';

describe('SeekableReadableStream', () => {
    it('should call the seek callback when seek is called', async () => {
        const mockSeek = jest.fn().mockResolvedValue(undefined);
        const mockStart = jest.fn();

        const stream = new SeekableReadableStream({
            start: mockStart,
            seek: mockSeek,
        });

        await stream.seek(100);

        expect(mockSeek).toHaveBeenCalledWith(100);
        expect(mockSeek).toHaveBeenCalledTimes(1);
    });

    it('should handle synchronous seek callback', async () => {
        const mockSeek = jest.fn().mockReturnValue(undefined);

        const stream = new SeekableReadableStream({
            seek: mockSeek,
        });

        await stream.seek(250);

        expect(mockSeek).toHaveBeenCalledWith(250);
    });
});

describe('BufferedSeekableStream', () => {
    let startWithCloseMock: jest.Mock;
    let pullMock: jest.Mock;
    let seekableSource: UnderlyingSeekableSource;

    const data1 = new Uint8Array([1, 2, 3, 4, 5]);
    const data2 = new Uint8Array([6, 7, 8, 9, 10]);

    beforeEach(() => {
        startWithCloseMock = jest.fn().mockImplementation((controller) => {
            controller.enqueue(data1);
            controller.close();
        });

        let readIndex = 0;
        pullMock = jest.fn().mockImplementation((controller) => {
            if (readIndex === 0) {
                controller.enqueue(data1);
            } else if (readIndex === 1) {
                controller.enqueue(data2);
            } else {
                controller.close();
            }
            readIndex++;
        });

        // Simulates a real seekable source where seek repositions the read pointer
        const fileData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        let readPosition = 0;
        const chunkSize = 5;

        seekableSource = {
            pull: jest.fn().mockImplementation((controller) => {
                if (readPosition >= fileData.length) {
                    controller.close();
                    return;
                }
                const chunk = fileData.slice(readPosition, readPosition + chunkSize);
                readPosition += chunk.length;
                controller.enqueue(chunk);
            }),
            seek: jest.fn().mockImplementation((position: number) => {
                readPosition = position;
            }),
        };
    });

    it('should throw error if highWaterMark is not 0', () => {
        expect(() => {
            new BufferedSeekableStream({ seek: jest.fn() }, { highWaterMark: 1 });
        }).toThrow('highWaterMark must be 0');
    });

    it('should throw error when reading invalid number of bytes', async () => {
        const stream = new BufferedSeekableStream({
            seek: jest.fn(),
        });

        await expect(stream.read(0)).rejects.toThrow('Invalid number of bytes to read');
        await expect(stream.read(-1)).rejects.toThrow('Invalid number of bytes to read');
    });

    it('should read exact number of bytes when underlying source provides exact amount', async () => {
        const stream = new BufferedSeekableStream({
            start: startWithCloseMock,
            seek: jest.fn(),
        });

        const result = await stream.read(5);

        expect(result).toEqual({ value: data1, done: false });
    });

    it('should buffer extra bytes when underlying source provides more than requested', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        const result1 = await stream.read(3);
        expect(result1).toEqual({ value: new Uint8Array([1, 2, 3]), done: false });
        expect(pullMock).toHaveBeenCalledTimes(1);

        const result2 = await stream.read(2);
        expect(result2).toEqual({ value: new Uint8Array([4, 5]), done: false });
        expect(pullMock).toHaveBeenCalledTimes(1);
    });

    it('should use buffered data and read more when buffer is not enough for next read', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        const result1 = await stream.read(3);
        expect(result1).toEqual({ value: new Uint8Array([1, 2, 3]), done: false });
        expect(pullMock).toHaveBeenCalledTimes(1);

        const result2 = await stream.read(5);
        expect(result2).toEqual({ value: new Uint8Array([4, 5, 6, 7, 8]), done: false });
        expect(pullMock).toHaveBeenCalledTimes(2);
    });

    it('should handle end of file gracefully when not enough data available', async () => {
        const stream = new BufferedSeekableStream({
            start: startWithCloseMock,
            seek: jest.fn(),
        });

        const result = await stream.read(10);
        expect(result).toEqual({ value: data1, done: true });
    });

    it('should clear buffer when seeking back', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        const result1 = await stream.read(2);
        expect(result1).toEqual({ value: new Uint8Array([1, 2]), done: false });

        await stream.seek(0);

        const result2 = await stream.read(3);
        expect(result2).toEqual({ value: new Uint8Array([6, 7, 8]), done: false });
    });

    it('should clear buffer when seeking past buffer end', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        const result1 = await stream.read(2);
        expect(result1).toEqual({ value: new Uint8Array([1, 2]), done: false });

        await stream.seek(100);

        const result2 = await stream.read(3);
        expect(result2).toEqual({ value: new Uint8Array([6, 7, 8]), done: false });
    });

    it('should update buffer correctly when seeking within buffer range', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        const result1 = await stream.read(1);
        expect(result1).toEqual({ value: new Uint8Array([1]), done: false });

        await stream.seek(3);

        const result2 = await stream.read(3);
        expect(result2).toEqual({ value: new Uint8Array([4, 5, 6]), done: false });
    });

    it('should handle multiple read operations correctly', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        const result1 = await stream.read(2);
        expect(result1).toEqual({ value: new Uint8Array([1, 2]), done: false });

        const result2 = await stream.read(4);
        expect(result2).toEqual({ value: new Uint8Array([3, 4, 5, 6]), done: false });

        const result3 = await stream.read(3);
        expect(result3).toEqual({ value: new Uint8Array([7, 8, 9]), done: false });

        const result4 = await stream.read(2);
        expect(result4).toEqual({ value: new Uint8Array([10]), done: true });
    });

    it('should catch and ignore TypeError from releaseLock during seek', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        await stream.read(2);

        const reader = (stream as any).reader;
        const originalReleaseLock = reader.releaseLock.bind(reader);
        jest.spyOn(reader, 'releaseLock').mockImplementation(() => {
            originalReleaseLock();
            throw new TypeError('Reader has pending read requests');
        });

        await expect(stream.seek(0)).resolves.not.toThrow();
    });

    it('should re-throw non-TypeError errors from releaseLock during seek', async () => {
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: jest.fn(),
        });

        await stream.read(2);

        const reader = (stream as any).reader;
        const customError = new Error('Custom error');
        jest.spyOn(reader, 'releaseLock').mockImplementation(() => {
            throw customError;
        });

        await expect(stream.seek(0)).rejects.toThrow(customError);
    });

    it('should not call underlying seek when seeking within buffer range', async () => {
        const seekMock = jest.fn();
        const stream = new BufferedSeekableStream({
            pull: pullMock,
            seek: seekMock,
        });

        await stream.read(2);
        expect(seekMock).not.toHaveBeenCalled();

        // Seek within buffer range (buffer has bytes for positions 2-4)
        await stream.seek(3);
        expect(seekMock).not.toHaveBeenCalled();

        // Seek to current position (still within buffer)
        await stream.seek(3);
        expect(seekMock).not.toHaveBeenCalled();
    });

    it('should not corrupt data when seeking to current position with seekable underlying source', async () => {
        const stream = new BufferedSeekableStream(seekableSource);

        // Read first 3 bytes [0, 1, 2], buffer will have [0, 1, 2, 3, 4]
        const result1 = await stream.read(3);
        expect(result1.value).toEqual(new Uint8Array([0, 1, 2]));
        expect(seekableSource.seek).not.toHaveBeenCalled();

        // Seek to position 3 (current position), should use buffer without seeking underlying source
        await stream.seek(3);
        expect(seekableSource.seek).not.toHaveBeenCalled();

        // Buffer has [3, 4], needs 2 more from underlying source
        // Underlying source stays at position 5, giving [5, 6, 7, 8, 9]
        // Buffer becomes [3, 4, 5, 6, 7, 8, 9]
        const result2 = await stream.read(4);
        expect(result2.value).toEqual(new Uint8Array([3, 4, 5, 6]));
        expect(seekableSource.seek).not.toHaveBeenCalled();

        // Continue reading to verify stream integrity
        const result3 = await stream.read(3);
        expect(result3.value).toEqual(new Uint8Array([7, 8, 9]));
    });

    it('should call underlying seek only when seeking outside buffer range', async () => {
        const stream = new BufferedSeekableStream(seekableSource);

        // Read first 3 bytes [0, 1, 2], buffer will have [0, 1, 2, 3, 4]
        await stream.read(3);
        expect(seekableSource.seek).not.toHaveBeenCalled();

        // Seek backward (outside buffer range) - should call underlying seek
        await stream.seek(0);
        expect(seekableSource.seek).toHaveBeenCalledWith(0);
        expect(seekableSource.seek).toHaveBeenCalledTimes(1);

        // Read and verify data is correct after backward seek
        const result1 = await stream.read(3);
        expect(result1.value).toEqual(new Uint8Array([0, 1, 2]));

        // Seek forward past buffer end - should call underlying seek
        await stream.seek(10);
        expect(seekableSource.seek).toHaveBeenCalledWith(10);
        expect(seekableSource.seek).toHaveBeenCalledTimes(2);

        // Read and verify data is correct after forward seek
        const result2 = await stream.read(3);
        expect(result2.value).toEqual(new Uint8Array([10, 11, 12]));
    });
});
