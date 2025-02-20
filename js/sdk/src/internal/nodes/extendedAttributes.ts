import { Logger } from "../../interface";

interface FolderExtendedAttributesSchema {
    Common?: {
        ModificationTime?: string;
    };
}

interface FileExtendedAttributesSchema {
    Common?: {
        ModificationTime?: string;
        Size?: number;
        BlockSizes?: number[];
        Digests?: {
            SHA1: string;
        };
    };
    Location?: {
        Latitude?: number;
        Longitude?: number;
    };
    Camera?: {
        CaptureTime?: string;
        Device?: string;
        Orientation?: number;
        SubjectCoordinates?: {
            Top?: number;
            Left?: number;
            Bottom?: number;
            Right?: number;
        };
    };
    Media?: {
        Width?: number;
        Height?: number;
        Duration?: number;
    };
}

export interface FolderExtendedAttributes {
    claimedModificationTime?: Date,
}

export interface FileExtendedAttributesParsed {
    claimedSize?: number,
    claimedModificationTime?: Date,
    claimedDigests?: {
        sha1?: string,
    },
    claimedAdditionalMetadata?: object,
}

export function parseFolderExtendedAttributes(extendedAttributes?: string, log?: Logger): FolderExtendedAttributes {
    if (!extendedAttributes) {
        return {};
    }

    try {
        const parsed = JSON.parse(extendedAttributes) as FolderExtendedAttributesSchema;
        return {
            claimedModificationTime: parseModificationTime(parsed, log),
        };
    } catch (error: unknown) {
        log?.error(`Failed to parse extended attributes: ${error instanceof Error ? error.message : error}`);
        return {};
    }
}

export function parseFileExtendedAttributes(extendedAttributes?: string, log?: Logger): FileExtendedAttributesParsed {
    if (!extendedAttributes) {
        return {}
    }

    try {
        const parsed = JSON.parse(extendedAttributes) as FolderExtendedAttributesSchema;

        const claimedAdditionalMetadata = { ...parsed };
        delete claimedAdditionalMetadata.Common;

        return {
            claimedSize: parseSize(parsed, log),
            claimedModificationTime: parseModificationTime(parsed, log),
            claimedDigests: parseDigests(parsed, log),
            claimedAdditionalMetadata: Object.keys(claimedAdditionalMetadata).length ? claimedAdditionalMetadata : undefined,
        };
    } catch (error: unknown) {
        log?.error(`Failed to parse extended attributes: ${error instanceof Error ? error.message : error}`);
        return {};
    }
}

function parseSize(xattr?: FileExtendedAttributesSchema, log?: Logger): number | undefined {
    const size = xattr?.Common?.Size;
    if (size === undefined) {
        return undefined;
    }
    if (typeof size !== 'number') {
        log?.warn(`XAttr file size "${size}" is not valid`);
        return undefined;
    }
    return size;
}

function parseModificationTime(xattr?: FolderExtendedAttributesSchema | FolderExtendedAttributesSchema, log?: Logger): Date | undefined {
    const modificationTime = xattr?.Common?.ModificationTime;
    if (modificationTime === undefined) {
        return undefined;
    }
    const modificationDate = new Date(modificationTime);
    // This is the best way to check if date is "Invalid Date". :shrug:
    if (JSON.stringify(modificationDate) === 'null') {
        log?.warn(`XAttr modification time "${modificationTime}" is not valid`);
        return undefined;
    }
    return modificationDate;
}

function parseDigests(xattr?: FileExtendedAttributesSchema, log?: Logger): { sha1: string } | undefined {
    const digests = xattr?.Common?.Digests;
    if (digests === undefined || digests.SHA1 === undefined) {
        return undefined;
    }

    const sha1 = digests.SHA1;
    if (typeof sha1 !== 'string') {
        log?.warn(`XAttr digest SHA1 "${sha1}" is not valid`);
        return undefined;
    }

    return {
        sha1,
    };
}
