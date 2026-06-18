/**
 * Split a filename into `[name, extension]`
 */
export function splitExtension(filename = ''): [string, string] {
    const endIdx = filename.lastIndexOf('.');
    if (endIdx === -1 || endIdx === 0 || endIdx === filename.length - 1) {
        return [filename, ''];
    }
    return [filename.slice(0, endIdx), filename.slice(endIdx + 1)];
}

/**
 * Join a filename into `name (index).extension`
 */
export function joinNameAndExtension(name: string, index: number, extension: string): string {
    if (!name && !extension) {
        return `(${index})`;
    }
    if (!name) {
        return `(${index}).${extension}`;
    }
    if (!extension) {
        return `${name} (${index})`;
    }
    return `${name} (${index}).${extension}`;
}
