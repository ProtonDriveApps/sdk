import { Logger } from '../../interface';

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
    claimedModificationTime?: Date;
}

export interface FileExtendedAttributesParsed {
    claimedSize?: number;
    claimedModificationTime?: Date;
    claimedDigests?: {
        sha1?: string;
    };
    claimedAdditionalMetadata?: object;
}

export function generateFolderExtendedAttributes(claimedModificationTime?: Date): string | undefined {
    if (!claimedModificationTime) {
        return undefined;
    }
    return JSON.stringify({
        Common: {
            ModificationTime: dateToIsoString(claimedModificationTime),
        },
    });
}

function dateToIsoString(date: Date) {
    const isDateValid = !Number.isNaN(date.getTime());
    return isDateValid ? date.toISOString() : undefined;
}

export function parseFolderExtendedAttributes(logger: Logger, extendedAttributes?: string): FolderExtendedAttributes {
    if (!extendedAttributes) {
        return {};
    }

    try {
        const parsed = JSON.parse(extendedAttributes) as FolderExtendedAttributesSchema;
        return {
            claimedModificationTime: parseModificationTime(logger, parsed),
        };
    } catch (error: unknown) {
        logger.error(`Failed to parse extended attributes`, error);
        return {};
    }
}

export function generateFileExtendedAttributes(options: {
    modificationTime?: Date;
    size?: number;
    blockSizes?: number[];
    digests?: {
        sha1?: string;
    };
}): string | undefined {
    const commonAttributes: FileExtendedAttributesSchema['Common'] = {};
    if (options.modificationTime) {
        commonAttributes.ModificationTime = dateToIsoString(options.modificationTime);
    }
    if (options.size !== undefined) {
        commonAttributes.Size = options.size;
    }
    if (options.blockSizes?.length) {
        commonAttributes.BlockSizes = options.blockSizes;
    }
    if (options.digests?.sha1) {
        commonAttributes.Digests = {
            SHA1: options.digests.sha1,
        };
    }
    if (!Object.keys(commonAttributes).length) {
        return undefined;
    }
    return JSON.stringify({
        Common: commonAttributes,
    });
}

export function parseFileExtendedAttributes(logger: Logger, extendedAttributes?: string): FileExtendedAttributesParsed {
    if (!extendedAttributes) {
        return {};
    }

    try {
        const parsed = JSON.parse(extendedAttributes) as FolderExtendedAttributesSchema;

        const claimedAdditionalMetadata = { ...parsed };
        delete claimedAdditionalMetadata.Common;

        return {
            claimedSize: parseSize(logger, parsed),
            claimedModificationTime: parseModificationTime(logger, parsed),
            claimedDigests: parseDigests(logger, parsed),
            claimedAdditionalMetadata: Object.keys(claimedAdditionalMetadata).length
                ? claimedAdditionalMetadata
                : undefined,
        };
    } catch (error: unknown) {
        logger.error(`Failed to parse extended attributes`, error);
        return {};
    }
}

function parseSize(logger: Logger, xattr?: FileExtendedAttributesSchema): number | undefined {
    const size = xattr?.Common?.Size;
    if (size === undefined) {
        return undefined;
    }
    if (typeof size !== 'number') {
        logger.warn(`XAttr file size "${size}" is not valid`);
        return undefined;
    }
    return size;
}

function parseModificationTime(
    logger: Logger,
    xattr?: FolderExtendedAttributesSchema | FolderExtendedAttributesSchema,
): Date | undefined {
    const modificationTime = xattr?.Common?.ModificationTime;
    if (modificationTime === undefined) {
        return undefined;
    }
    const modificationDate = new Date(modificationTime);
    // This is the best way to check if date is "Invalid Date". :shrug:
    if (JSON.stringify(modificationDate) === 'null') {
        logger.warn(`XAttr modification time "${modificationTime}" is not valid`);
        return undefined;
    }
    return modificationDate;
}

function parseDigests(logger: Logger, xattr?: FileExtendedAttributesSchema): { sha1: string } | undefined {
    const digests = xattr?.Common?.Digests;
    if (digests === undefined || digests.SHA1 === undefined) {
        return undefined;
    }

    const sha1 = digests.SHA1;
    if (typeof sha1 !== 'string') {
        logger.warn(`XAttr digest SHA1 "${sha1}" is not valid`);
        return undefined;
    }

    return {
        sha1,
    };
}
