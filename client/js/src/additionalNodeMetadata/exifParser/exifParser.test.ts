import type { ExpandedTags } from 'exifreader';
import ExifReader from 'exifreader';

import { getExifInfo } from './exifParser';

jest.mock('exifreader', () => ({
    __esModule: true,
    default: {
        load: jest.fn(),
    },
}));

describe('getExifInfo', () => {
    let mockExifReaderLoad: jest.Mock;

    beforeEach(() => {
        mockExifReaderLoad = jest.mocked(ExifReader.load);
        jest.clearAllMocks();
    });

    it('should return undefined for non-image mime types', async () => {
        const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });

        const result = await getExifInfo(file, 'application/pdf');

        expect(result).toBeUndefined();
        expect(mockExifReaderLoad).not.toHaveBeenCalled();
    });

    it('should parse EXIF data for image mime type', async () => {
        const mockExifData: ExpandedTags = {
            exif: {
                DateTimeOriginal: {
                    id: 36867,
                    value: ['2024:01:07 09:00:53'],
                    description: '2024:01:07 09:00:53',
                },
            },
        } as ExpandedTags;

        mockExifReaderLoad.mockResolvedValue(mockExifData);

        const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
        file.arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(8));

        const result = await getExifInfo(file, 'image/jpeg');

        expect(result).toEqual(mockExifData);
        expect(mockExifReaderLoad).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
            expanded: true,
            domParser: expect.anything(),
        });
    });

    it('should return undefined and warn when ExifReader throws an error', async () => {
        const error = new Error('Invalid EXIF data');
        mockExifReaderLoad.mockImplementation(() => {
            throw error;
        });
        const loggerMock = {
            warn: jest.fn(),
        };

        const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
        file.arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(8));

        const result = await getExifInfo(file, 'image/jpeg', loggerMock as any);

        expect(result).toBeUndefined();
        expect(loggerMock.warn).toHaveBeenCalledWith(`Cannot read exif data: ${error.message}`);
    });
});
