import type { ExpandedTags } from 'exifreader';

export type ExifInfo = ExpandedTags;

export interface FileLike {
    name?: string;
    lastModified: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface MediaInfo {
    width?: number;
    height?: number;
    duration?: number;
}

export interface AdditionalNodeMetadata {
    Media?: {
        Width?: number;
        Height?: number;
        Duration?: number;
    };
    Location?: {
        Latitude: number;
        Longitude: number;
    };
    Camera?: {
        CaptureTime?: string;
        Device?: string;
        Orientation?: number;
        SubjectCoordinates?: {
            Top: number;
            Left: number;
            Bottom: number;
            Right: number;
        };
    };
}
