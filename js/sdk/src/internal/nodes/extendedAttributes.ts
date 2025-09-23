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
    claimedBlockSizes?: number[];
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

export function generateFileExtendedAttributes(
    common: {
        modificationTime?: Date;
        size?: number;
        blockSizes?: number[];
        digests?: {
            sha1?: string;
        };
    },
    additionalMetadata?: object,
): string | undefined {
    if (additionalMetadata && 'Common' in additionalMetadata) {
        throw new Error('Common attributes are not allowed in additional metadata');
    }

    const commonAttributes: FileExtendedAttributesSchema['Common'] = {};
    if (common.modificationTime) {
        commonAttributes.ModificationTime = dateToIsoString(common.modificationTime);
    }
    if (common.size !== undefined) {
        commonAttributes.Size = common.size;
    }
    if (common.blockSizes?.length) {
        commonAttributes.BlockSizes = common.blockSizes;
    }
    if (common.digests?.sha1) {
        commonAttributes.Digests = {
            SHA1: common.digests.sha1,
        };
    }
    if (!Object.keys(commonAttributes).length && !additionalMetadata) {
        return undefined;
    }
    return JSON.stringify({
        ...(Object.keys(commonAttributes).length ? { Common: commonAttributes } : {}),
        ...(additionalMetadata ? { ...additionalMetadata } : {}),
    });
}

export function parseFileExtendedAttributes(
    logger: Logger,
    creationTime: Date,
    extendedAttributes?: string,
): FileExtendedAttributesParsed {
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
            claimedBlockSizes: parseBlockSizes(logger, creationTime, parsed),
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

function parseBlockSizes(
    logger: Logger,
    creationTime: Date,
    xattr?: FileExtendedAttributesSchema,
): number[] | undefined {
    const blockSizes = xattr?.Common?.BlockSizes;
    if (blockSizes === undefined) {
        return undefined;
    }
    if (!Array.isArray(blockSizes)) {
        logger.warn(`XAttr block sizes "${blockSizes}" is not valid`);
        return undefined;
    }
    if (blockSizes.some((size) => typeof size !== 'number' || size <= 0)) {
        logger.warn(`XAttr block sizes "${blockSizes}" is not valid`);
        return undefined;
    }
    if (blockSizes.length === 0) {
        return undefined;
    }
    // Before 2025, there was a bug on the Windows client that didn't sort
    // the block sizes in correct order. Because the sizes were all the same
    // except the last one, which was always smaller, the block sizes must be
    // sorted in descending order.
    if (creationTime < new Date('2025-01-01')) {
        return blockSizes.sort((a, b) => b - a);
    }
    return blockSizes;
}
