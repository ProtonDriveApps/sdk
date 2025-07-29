export type Thumbnail = {
    type: ThumbnailType;
    thumbnail: Uint8Array;
};

export enum ThumbnailType {
    Type1 = 1,
    Type2 = 2,
}

export type ThumbnailResult =
    | { nodeUid: string; ok: true; thumbnail: Uint8Array }
    | { nodeUid: string; ok: false; error: string };
