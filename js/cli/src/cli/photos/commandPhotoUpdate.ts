import { ParseArgsConfig } from 'util';

import { PhotoTag } from '../../../../sdk/src';
import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

const TAG_NAME_TO_ENUM: Record<string, PhotoTag> = {
    favorites: PhotoTag.Favorites,
    screenshots: PhotoTag.Screenshots,
    videos: PhotoTag.Videos,
    'live-photos': PhotoTag.LivePhotos,
    'motion-photos': PhotoTag.MotionPhotos,
    selfies: PhotoTag.Selfies,
    portraits: PhotoTag.Portraits,
    bursts: PhotoTag.Bursts,
    panoramas: PhotoTag.Panoramas,
    raw: PhotoTag.Raw,
};

export class CommandPhotoUpdate implements Command {
    group = 'photo';
    name = 'update';
    args = ['path']
    options: ParseArgsConfig['options'] = {
        'add-tags': {
            type: 'string',
            short: 'a',
            default: '',
        },
        'remove-tags': {
            type: 'string',
            short: 'r',
            default: '',
        },
    };

    async action({
        paths,
        photosSdk,
        args: pathStrings,
        options: { json, 'add-tags': addTagsOpt, 'remove-tags': removeTagsOpt },
    }: ActionArgs) {
        if (pathStrings.length === 0) {
            throw new Error('At least one photo path must be provided');
        }

        const addTags = parseTagOption(addTagsOpt || '');
        const removeTags = parseTagOption(removeTagsOpt || '');

        if (addTags.length === 0 && removeTags.length === 0) {
            throw new Error('At least one of --add-tags or --remove-tags must be provided');
        }

        const photoNodes = await Promise.all(
            pathStrings.map(async (pathString) => {
                const photoPath = paths.getPath(pathString);
                return photoPath.getNode();
            }),
        );

        await printIterable(
            photosSdk.updatePhotos(
                photoNodes.map((node) => ({ nodeUid: node, tagsToAdd: addTags, tagsToRemove: removeTags })),
            ),
            json,
            (result) => console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`),
        );
    }
}

function parseTagOption(value: string): PhotoTag[] {
    if (!value.trim()) {
        return [];
    }
    const tags: PhotoTag[] = [];
    const parts = value.split(',').map((s) => s.trim().toLowerCase());
    for (const part of parts) {
        const asEnum = TAG_NAME_TO_ENUM[part];
        if (asEnum !== undefined) {
            tags.push(asEnum);
        } else {
            const asNum = parseInt(part, 10);
            if (Number.isInteger(asNum) && asNum >= 0 && asNum <= 9) {
                tags.push(asNum as PhotoTag);
            } else {
                throw new Error(
                    `Invalid tag: "${part}". Use comma-separated names (e.g. favorites,screenshots) or numbers 0-9.`,
                );
            }
        }
    }
    return tags;
}
