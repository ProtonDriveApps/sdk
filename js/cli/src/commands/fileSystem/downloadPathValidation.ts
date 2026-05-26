import path from 'node:path';

import { ValidationError } from '@protontech/drive-sdk';

/** Characters invalid in a single path segment on common platforms. */
const ILLEGAL_SEGMENT_CHARS = /[\x00-\x1f\x7f<>:"|?*\\/]/g;

/** Windows reserved device names (case-insensitive), with optional extension. */
const WIN_RESERVED_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Refuses empty input, POSIX `/`, and Windows drive roots.
 */
export function assertValidDownloadRoot(localFolder: string): string {
    const trimmed = localFolder.trim();
    if (!trimmed) {
        throw new ValidationError('Local folder path must not be empty');
    }

    const resolved = path.resolve(trimmed);

    if (resolved === '/') {
        throw new ValidationError('Refusing to use filesystem root as download destination');
    }

    if (process.platform === 'win32') {
        const parsed = path.parse(resolved);
        const rest = resolved.slice(parsed.root.length).replace(/[/\\]/g, '');
        if (rest.length === 0) {
            throw new ValidationError('Refusing to use drive root as download destination');
        }
    }

    return resolved;
}

/**
 * Ensures the absolute destination stays under `downloadRootResolved` and each relative segment passes {@link assertValidPathSegment}.
 */
export function assertDownloadDestination(downloadRoot: string, destinationPath: string): void {
    const root = path.resolve(downloadRoot);
    const dest = path.resolve(destinationPath);
    const rel = path.relative(root, dest);

    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new ValidationError(`Download path escapes destination folder: ${destinationPath}`);
    }

    if (rel === '') {
        return;
    }

    const segments = rel.split(/[/\\]/u).filter(Boolean);
    for (const segment of segments) {
        assertValidPathSegment(segment);
    }
}

/**
 * Ensures the path segment is valid (not empty, not a traversal, not a reserved name, not a special character).
 */
export function assertValidPathSegment(name: string): void {
    if (name.length === 0) {
        throw new ValidationError('Invalid empty path segment');
    }
    if (name === '.' || name === '..') {
        throw new ValidationError(`Invalid path segment: "${name}"`);
    }
    if (ILLEGAL_SEGMENT_CHARS.test(name)) {
        throw new ValidationError(`Invalid character in path segment: "${name}"`);
    }
    if (process.platform === 'win32') {
        if (WIN_RESERVED_NAME.test(name)) {
            throw new ValidationError(`Reserved path segment name: "${name}"`);
        }
        const trailing = /[.\u0020]$/;
        if (trailing.test(name)) {
            throw new ValidationError(`Invalid path segment (trailing dot or space): "${name}"`);
        }
    }
}

/**
 * Produces a single path segment safe for the current OS by replacing characters
 * invalid on common platforms with `_`, adjusting `.` / `..`, Windows reserved
 * names, and (on Windows) trailing dots/spaces.
 */
export function sanitizePathSegmentForLocalFilesystem(name: string): string {
    let segment = name.replace(ILLEGAL_SEGMENT_CHARS, '_');
    if (segment.length === 0) {
        return '_';
    }
    if (segment === '.') {
        return '_';
    }
    if (segment === '..') {
        return '__';
    }
    if (process.platform === 'win32') {
        if (WIN_RESERVED_NAME.test(segment)) {
            segment = `_${segment}`;
        }
        segment = segment.replace(/[.\u0020]+$/gu, (m) => '_'.repeat(m.length));
    }
    return segment;
}
