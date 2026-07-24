import { parseAdditionalNodeMetadata } from './parser';

describe('parseClaimedAdditionalMetadata', () => {
    it('should return empty object when input is empty', () => {
        expect(parseAdditionalNodeMetadata({})).toEqual({});
    });

    describe('Location', () => {
        it('should parse valid location', () => {
            const result = parseAdditionalNodeMetadata({
                Location: { Latitude: 48.8566, Longitude: 2.3522 },
            });

            expect(result.Location).toEqual({ Latitude: 48.8566, Longitude: 2.3522 });
        });

        it('should reject location with latitude out of range', () => {
            const result = parseAdditionalNodeMetadata({
                Location: { Latitude: 91, Longitude: 2 },
            });

            expect(result.Location).toBeUndefined();
        });

        it('should accept negative longitude', () => {
            const result = parseAdditionalNodeMetadata({
                Location: { Latitude: 48, Longitude: -1 },
            });

            expect(result.Location).toEqual({ Latitude: 48, Longitude: -1 });
        });

        it('should reject location with longitude below -180', () => {
            const result = parseAdditionalNodeMetadata({
                Location: { Latitude: 48, Longitude: -181 },
            });

            expect(result.Location).toBeUndefined();
        });

        it('should reject location with longitude over 180', () => {
            const result = parseAdditionalNodeMetadata({
                Location: { Latitude: 48, Longitude: 181 },
            });

            expect(result.Location).toBeUndefined();
        });

        it('should reject location when one coordinate is missing', () => {
            const result = parseAdditionalNodeMetadata({
                Location: { Latitude: 48 },
            });

            expect(result.Location).toBeUndefined();
        });

        it('should accept boundary values', () => {
            const result = parseAdditionalNodeMetadata({
                Location: { Latitude: -90, Longitude: 0 },
            });

            expect(result.Location).toEqual({ Latitude: -90, Longitude: 0 });
        });
    });

    describe('Camera', () => {
        it('should parse valid camera fields', () => {
            const result = parseAdditionalNodeMetadata({
                Camera: {
                    CaptureTime: '2024-01-01T12:00:00Z',
                    Device: 'iPhone 15',
                    Orientation: 1,
                    SubjectCoordinates: { Top: 10, Left: 20, Bottom: 100, Right: 200 },
                },
            });

            expect(result.Camera).toEqual({
                CaptureTime: '2024-01-01T12:00:00Z',
                Device: 'iPhone 15',
                Orientation: 1,
                SubjectCoordinates: { Top: 10, Left: 20, Bottom: 100, Right: 200 },
            });
        });

        it('should reject orientation out of range [1-8]', () => {
            const result = parseAdditionalNodeMetadata({ Camera: { Orientation: 9 } });

            expect(result.Camera?.Orientation).toBeUndefined();
        });

        it('should reject orientation of 0', () => {
            const result = parseAdditionalNodeMetadata({ Camera: { Orientation: 0 } });

            expect(result.Camera?.Orientation).toBeUndefined();
        });

        it('should accept all valid orientation values', () => {
            for (let i = 1; i <= 8; i++) {
                const result = parseAdditionalNodeMetadata({ Camera: { Orientation: i } });

                expect(result.Camera?.Orientation).toBe(i);
            }
        });

        it('should reject SubjectCoordinates when a field is missing', () => {
            const result = parseAdditionalNodeMetadata({
                Camera: { SubjectCoordinates: { Top: 10, Left: 20, Bottom: 100 } },
            });

            expect(result.Camera?.SubjectCoordinates).toBeUndefined();
        });

        it('should reject SubjectCoordinates with non-integer values', () => {
            const result = parseAdditionalNodeMetadata({
                Camera: { SubjectCoordinates: { Top: 10.5, Left: 20, Bottom: 100, Right: 200 } },
            });

            expect(result.Camera?.SubjectCoordinates).toBeUndefined();
        });
    });

    describe('Media', () => {
        it('should parse valid media fields', () => {
            const result = parseAdditionalNodeMetadata({
                Media: { Width: 1920, Height: 1080, Duration: 60.5 },
            });

            expect(result.Media).toEqual({ Width: 1920, Height: 1080, Duration: 60.5 });
        });

        it('should reject non-integer Width', () => {
            const result = parseAdditionalNodeMetadata({ Media: { Width: 1920.5 } });

            expect(result.Media?.Width).toBeUndefined();
        });

        it('should accept float Duration', () => {
            const result = parseAdditionalNodeMetadata({ Media: { Duration: 1.5 } });

            expect(result.Media?.Duration).toBe(1.5);
        });

        it('should reject Infinity as Duration', () => {
            const result = parseAdditionalNodeMetadata({ Media: { Duration: Infinity } });

            expect(result.Media?.Duration).toBeUndefined();
        });
    });

    it('should parse all sections together', () => {
        const result = parseAdditionalNodeMetadata({
            Location: { Latitude: 10, Longitude: 20 },
            Camera: { Device: 'Pixel 8' },
            Media: { Width: 4096, Height: 2160 },
            'iOS.photos': { ICloudID: 'xyz' },
        });

        expect(result.Location?.Latitude).toBe(10);
        expect(result.Camera?.Device).toBe('Pixel 8');
        expect(result.Media?.Width).toBe(4096);
    });

    it('should return undefined section when all fields are invalid', () => {
        const result = parseAdditionalNodeMetadata({ Camera: { Orientation: 99, Device: 123 } });

        expect(result.Camera).toBeUndefined();
    });

    it('should ignore unknown top-level keys', () => {
        const result = parseAdditionalNodeMetadata({ Unknown: { Foo: 'bar' } });

        expect(result).toEqual({});
    });
});
