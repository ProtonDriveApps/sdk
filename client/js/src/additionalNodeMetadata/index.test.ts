import { PhotoTag } from '../interface';
import { getExifInfo } from './exifParser/exifParser';
import { getCaptureDateTime } from './exifParser/exifUtils';
import { getPhotoTags } from './exifParser/tagDetector';
import { generateAdditionalNodeMetadata, generateAdditionalPhotoNodeMetadata } from './index';
import { buildAdditionalNodeMetadata } from './metadata/builder';

jest.mock('./exifParser/exifParser');
jest.mock('./exifParser/exifUtils');
jest.mock('./exifParser/tagDetector');
jest.mock('./metadata/builder');

describe('generateAdditionalNodeMetadata', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should resolve metadata with built metadata', async () => {
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
        const expectedMetadata = {
            Media: { Width: 1920, Height: 1080, Duration: 120 },
            Location: { Latitude: 48.8566, Longitude: 2.3522 },
        };
        jest.mocked(getExifInfo).mockResolvedValue(undefined);
        jest.mocked(buildAdditionalNodeMetadata).mockReturnValue(expectedMetadata);

        const { additionalMetadata } = await generateAdditionalNodeMetadata(file, 'image/jpeg');

        expect(additionalMetadata).toEqual(expectedMetadata);
    });

    it('should handle undefined mediaInfo', async () => {
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
        jest.mocked(getExifInfo).mockResolvedValue(undefined);
        jest.mocked(buildAdditionalNodeMetadata).mockReturnValue({
            Media: {},
        });

        await generateAdditionalNodeMetadata(file, 'image/jpeg');

        expect(buildAdditionalNodeMetadata).toHaveBeenCalledWith(undefined, undefined);
    });
});

describe('generateAdditionalPhotoNodeMetadata', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should call buildAdditionalNodeMetadata with exifInfo and mediaInfo', async () => {
        const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
        const mockExifInfo = { exif: { DateTime: { value: ['2024:01:01 10:00:00'] } }, gps: {} } as any;
        const expectedTags = [PhotoTag.Raw, PhotoTag.Screenshots];
        const expectedMetadata = {
            Media: { Width: 1920, Height: 1080, Duration: 120 },
            Location: { Latitude: 48.8566, Longitude: 2.3522 },
        };
        const expectedCaptureTime = new Date('2024-01-15T14:30:00Z');
        jest.mocked(getExifInfo).mockResolvedValue(mockExifInfo);
        jest.mocked(buildAdditionalNodeMetadata).mockReturnValue({
            Media: { Width: 1920, Height: 1080 },
        });
        jest.mocked(getPhotoTags).mockResolvedValue(expectedTags);
        jest.mocked(getCaptureDateTime).mockReturnValue(expectedCaptureTime);
        jest.mocked(buildAdditionalNodeMetadata).mockReturnValue(expectedMetadata);

        const result = await generateAdditionalPhotoNodeMetadata(file, 'image/jpeg', {
            width: 1920,
            height: 1080,
            duration: 120,
        });

        expect(buildAdditionalNodeMetadata).toHaveBeenCalledWith(mockExifInfo, {
            width: 1920,
            height: 1080,
            duration: 120,
        });
        expect(getPhotoTags).toHaveBeenCalledWith(file, 'image/jpeg', mockExifInfo);
        expect(getCaptureDateTime).toHaveBeenCalledWith(file, mockExifInfo.exif);

        expect(result).toEqual({
            additionalMetadata: expectedMetadata,
            tags: expectedTags,
            captureTime: expectedCaptureTime,
        });
    });

    it('should handle undefined exifInfo', async () => {
        const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
        jest.mocked(getExifInfo).mockResolvedValue(undefined);
        jest.mocked(buildAdditionalNodeMetadata).mockReturnValue({
            Media: { Width: 1920, Height: 1080 },
        });
        jest.mocked(getPhotoTags).mockResolvedValue([]);
        jest.mocked(getCaptureDateTime).mockReturnValue(new Date('2024-01-01T00:00:00Z'));

        await generateAdditionalPhotoNodeMetadata(file, 'image/jpeg');

        expect(getCaptureDateTime).toHaveBeenCalledWith(file, undefined);
        expect(getPhotoTags).toHaveBeenCalledWith(file, 'image/jpeg', undefined);
    });

    it('should handle undefined mediaInfo', async () => {
        const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
        jest.mocked(getExifInfo).mockResolvedValue(undefined);
        jest.mocked(buildAdditionalNodeMetadata).mockReturnValue({
            Media: {},
        });
        jest.mocked(getPhotoTags).mockResolvedValue([]);
        jest.mocked(getCaptureDateTime).mockReturnValue(new Date('2024-01-01T00:00:00Z'));

        await generateAdditionalPhotoNodeMetadata(file, 'image/jpeg');

        expect(buildAdditionalNodeMetadata).toHaveBeenCalledWith(undefined, undefined);
    });
});
