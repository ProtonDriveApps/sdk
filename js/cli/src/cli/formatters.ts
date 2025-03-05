import { Author } from "../../../sdk/src";

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
