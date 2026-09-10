import { readdir } from 'node:fs/promises';

import { sanitizePathSegmentForLocalFilesystem } from '../fileSystem/downloadPathValidation';
import { MANIFEST_FILE_NAME, NODE_FILE_MANIFEST_SUFFIX } from './const';

/**
 * Allocates unique local names within a single destination folder.
 *
 * Remote names are neither unique nor always usable as local names, so every
 * name takeout writes is sanitized and, when already taken, suffixed with
 * ` (2)`, ` (3)`, and so on before the extension. Because that makes local
 * names lossy, the mapping back to the node UID is kept in the manifests.
 */
export class NameRegistry {
    /**
     * Names are compared lowercased because macOS and Windows treat `Notes.txt`
     * and `notes.txt` as the same file, and overwriting a file already written
     * by this run would lose data.
     */
    private readonly takenNames = new Set<string>();

    constructor(existingNames: string[] = []) {
        this.reserve(MANIFEST_FILE_NAME);
        for (const name of existingNames) {
            this.reserve(name);
        }
    }

    /**
     * Creates a registry that also avoids names already present in the folder,
     * so a re-run into a non-empty folder does not rename anything behind the
     * back of the manifests.
     */
    static async createForFolder(folderPath: string): Promise<NameRegistry> {
        return new NameRegistry(await listFolderNames(folderPath));
    }

    /** Allocates a name for a folder, or for a file without its own manifest. */
    allocate(remoteName: string): string {
        const sanitized = sanitizePathSegmentForLocalFilesystem(remoteName);
        for (let attempt = 1; ; attempt++) {
            const candidate = withDeduplicationSuffix(sanitized, attempt);
            if (!this.isTaken(candidate)) {
                this.reserve(candidate);
                return candidate;
            }
        }
    }

    /**
     * Allocates a content file name together with the name of the manifest
     * describing it.
     *
     * Both are allocated at once so the manifest is always the content file
     * name with `.manifest.json` appended, even when another node in the same
     * folder is genuinely called `notes.txt.manifest.json`.
     */
    allocateFileWithManifest(remoteName: string): { name: string; manifestName: string } {
        const sanitized = sanitizePathSegmentForLocalFilesystem(remoteName);
        for (let attempt = 1; ; attempt++) {
            const candidate = withDeduplicationSuffix(sanitized, attempt);
            const manifestName = `${candidate}${NODE_FILE_MANIFEST_SUFFIX}`;
            if (!this.isTaken(candidate) && !this.isTaken(manifestName)) {
                this.reserve(candidate);
                this.reserve(manifestName);
                return { name: candidate, manifestName };
            }
        }
    }

    private reserve(name: string): void {
        this.takenNames.add(name.toLowerCase());
    }

    private isTaken(name: string): boolean {
        return this.takenNames.has(name.toLowerCase());
    }
}

/**
 * Lists the folder, treating only a missing folder as empty.
 *
 * Any other failure, a missing permission above all, would leave the registry
 * blind to files that are actually there and let takeout overwrite them.
 */
async function listFolderNames(folderPath: string): Promise<string[]> {
    try {
        return await readdir(folderPath);
    } catch (error: unknown) {
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
            return [];
        }
        throw error;
    }
}

/** The first attempt keeps `report.pdf`, the second one turns it into `report (2).pdf`. */
function withDeduplicationSuffix(name: string, attempt: number): string {
    if (attempt === 1) {
        return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    return `${stem} (${attempt})${extension}`;
}
