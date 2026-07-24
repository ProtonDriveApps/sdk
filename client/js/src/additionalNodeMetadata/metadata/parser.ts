import type { AdditionalNodeMetadata } from '../interface';

export function parseAdditionalNodeMetadata(rawMetadata: unknown): AdditionalNodeMetadata {
    if (!isObject(rawMetadata)) {
        return {};
    }

    const result: AdditionalNodeMetadata = {};

    if (isObject(rawMetadata.Location)) {
        result.Location = parseLocation(rawMetadata.Location);
    }

    if (isObject(rawMetadata.Camera)) {
        const camera = rawMetadata.Camera;
        result.Camera = definedOrUndefined({
            CaptureTime: parseString(camera.CaptureTime),
            Device: parseString(camera.Device),
            Orientation: parseOrientation(camera.Orientation),
            SubjectCoordinates: parseSubjectCoordinates(camera.SubjectCoordinates),
        });
    }

    if (isObject(rawMetadata.Media)) {
        const media = rawMetadata.Media;
        result.Media = definedOrUndefined({
            Width: parseInteger(media.Width),
            Height: parseInteger(media.Height),
            Duration: parseNumber(media.Duration),
        });
    }

    return result;
}

function parseLocation(value: unknown): NonNullable<AdditionalNodeMetadata['Location']> | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const latitude = parseNumber(value.Latitude);
    const longitude = parseNumber(value.Longitude);

    if (latitude === undefined || longitude === undefined) {
        return undefined;
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return undefined;
    }

    return { Latitude: latitude, Longitude: longitude };
}

function parseSubjectCoordinates(
    value: unknown
): NonNullable<NonNullable<AdditionalNodeMetadata['Camera']>['SubjectCoordinates']> | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const top = parseInteger(value.Top);
    const left = parseInteger(value.Left);
    const bottom = parseInteger(value.Bottom);
    const right = parseInteger(value.Right);

    if (top === undefined || left === undefined || bottom === undefined || right === undefined) {
        return undefined;
    }

    return { Top: top, Left: left, Bottom: bottom, Right: right };
}

function parseOrientation(value: unknown): number | undefined {
    const num = parseInteger(value);
    if (num === undefined || num < 1 || num > 8) {
        return undefined;
    }
    return num;
}

function definedOrUndefined<T extends Record<string, unknown>>(obj: T): T | undefined {
    return Object.values(obj).some((v) => v !== undefined) ? obj : undefined;
}

function parseInteger(value: unknown): number | undefined {
    const num = parseNumber(value);
    return num !== undefined && Number.isInteger(num) ? num : undefined;
}

function parseNumber(value: unknown): number | undefined {
    return typeof value === 'number' && isFinite(value) ? value : undefined;
}

function parseString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
