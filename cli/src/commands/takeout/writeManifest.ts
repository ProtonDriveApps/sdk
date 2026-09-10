import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MANIFEST_FILE_NAME } from './const';
import type { TakeoutManifest } from './manifest';

export async function writeManifest(takeoutRoot: string, manifest: TakeoutManifest): Promise<void> {
    await writeJsonFile(path.join(takeoutRoot, MANIFEST_FILE_NAME), manifest);
}

export async function writeJsonFile(filePath: string, content: object): Promise<void> {
    await writeFile(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}
