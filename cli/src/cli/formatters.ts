import { stripVTControlCharacters } from 'node:util';

import { inspect } from 'util';

import { Author, MemberRole } from '@protontech/drive-sdk';

export function printObject(object: object | undefined, json: boolean) {
    if (json) {
        console.log(sanitizeTerminalText(JSON.stringify(object)));
    } else {
        console.log(object ? formatReadableJson(object) : 'N/A');
    }
}

export async function printIterable<T extends object>(
    iterable: AsyncIterable<T> | T[],
    json: boolean,
    humanReadableWriter: (item: T) => void = (item) => console.log(formatReadableJson(item)),
    jsonTransform: (item: T) => object = (json) => json,
): Promise<void> {
    if (json) {
        // Output streaming JSON array format
        process.stdout.write('[\n');
        let isFirst = true;
        for await (const item of iterable) {
            if (!isFirst) {
                process.stdout.write(',\n');
            }
            process.stdout.write(JSON.stringify(jsonTransform(item)));
            isFirst = false;
        }
        process.stdout.write('\n]\n');
    } else {
        for await (const item of iterable) {
            humanReadableWriter(item);
        }
    }
}

export function formatReadableJson(json: object) {
    // Prints the JSON in a readable format without the depth limit.
    // No styling: `colors` would add VT sequences that must not mix with unsanitized user strings.
    return sanitizeTerminalText(inspect(json, { showHidden: false, depth: null, colors: false }));
}

export function formatAuthor(author: Author) {
    return author.ok ? author.value : `(${author.error.claimedAuthor})`;
}

export function formatDate(date: Date, humanReadable: boolean = false) {
    if (humanReadable) {
        return `${date.toDateString().slice(4)} ${date.toTimeString().slice(0, 5)}`;
    }
    return date.toISOString();
}

export function formatSize(size: number | undefined, humanReadable: boolean = false) {
    if (size === undefined) {
        return 'N/A';
    }
    if (humanReadable) {
        if (size < 1024) {
            return `${size} B`;
        }
        if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(2)} KiB`;
        }
        if (size < 1024 * 1024 * 1024) {
            return `${(size / 1024 / 1024).toFixed(2)} MiB`;
        }
        return `${(size / 1024 / 1024 / 1024).toFixed(2)} GiB`;
    }
    return `${size}`;
}

export function formatMemberRole(memberRole: MemberRole): string {
    switch (memberRole) {
        case MemberRole.Inherited:
            return '  '; // Two spaces to align with icon.
        case MemberRole.Viewer:
            return '👁 '; // Extra space due to how terminal render this.
        case MemberRole.Editor:
            return '📝';
        case MemberRole.Admin:
            return '👑';
    }
}

export function sanitizeTerminalText(value: unknown): string {
    return stripVTControlCharacters(String(value));
}
