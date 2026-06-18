import { glob } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { ValidationError } from '@protontech/drive-sdk';

const LOCAL_PATH_LOOKS_GLOBBED = /[*?\[{]/;

/**
 * Resolves a local path to a list of absolute paths.
 * If the path is a glob, it is expanded to a list of paths.
 * If the path is relative from home, it is resolved to an absolute path.
 * @param localPath - The local path to resolve.
 * @returns A list of absolute paths.
 */
export async function resolveLocalPaths(localPath: string): Promise<string[]> {
    const absolute = expandLeadingTilde(localPath);
    const expanded = await expandLocalPathIfGlobbed(absolute);
    return expanded.map((p) => path.resolve(p));
}

async function expandLocalPathIfGlobbed(localPath: string): Promise<string[]> {
    if (!LOCAL_PATH_LOOKS_GLOBBED.test(localPath)) {
        return [localPath];
    }
    const matches = await Array.fromAsync(glob(localPath));
    matches.sort((a, b) => a.localeCompare(b));
    if (matches.length === 0) {
        throw new ValidationError(`No paths matched: ${localPath}`);
    }
    return matches;
}

function expandLeadingTilde(localPath: string): string {
    if (localPath === '~') {
        return homedir();
    }
    if (localPath.startsWith('~/') || localPath.startsWith('~\\')) {
        return path.join(homedir(), localPath.slice(2));
    }
    return localPath;
}
