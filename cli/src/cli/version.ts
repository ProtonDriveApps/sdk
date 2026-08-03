import { InitConfig } from '../config';

const VERSION_JSON_URL = 'https://proton.me/download/drive/cli/version.json';
const DOWNLOAD_PAGE_URL = 'https://proton.me/download/drive/cli/index.html';

interface VersionRelease {
    Version: string;
}

interface VersionManifest {
    Releases: VersionRelease[];
}

export async function printVersions(initOptions: InitConfig): Promise<void> {
    console.log(`Proton Drive CLI ${initOptions.appVersion}`);
    console.log(`Proton Drive SDK ${initOptions.sdkVersion}`);

    const currentVersion = extractSemver(initOptions.appVersion);
    if (!currentVersion) {
        return;
    }

    const latestVersion = await fetchLatestVersion();
    if (!latestVersion) {
        return;
    }

    if (compareSemver(currentVersion, latestVersion) >= 0) {
        console.log('You are running the latest version.');
        return;
    }

    console.log(`A newer version is available: ${latestVersion} (you have ${currentVersion}).`);
    console.log(`Download at ${DOWNLOAD_PAGE_URL}`);
}

function extractSemver(appVersion: string): string | undefined {
    const atIndex = appVersion.indexOf('@');
    if (atIndex === -1) {
        return undefined;
    }
    const match = appVersion.slice(atIndex + 1).match(/^(\d+\.\d+\.\d+)/);
    return match?.[1];
}

async function fetchLatestVersion(): Promise<string | undefined> {
    try {
        const response = await fetch(VERSION_JSON_URL, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            return undefined;
        }
        const manifest = (await response.json()) as VersionManifest;
        return findHighestVersion(manifest.Releases);
    } catch {
        return undefined;
    }
}

function findHighestVersion(releases: VersionRelease[] | undefined): string | undefined {
    if (!releases?.length) {
        return undefined;
    }
    return releases.reduce((highest, release) => {
        if (!release.Version) {
            return highest;
        }
        if (!highest || compareSemver(release.Version, highest) > 0) {
            return release.Version;
        }
        return highest;
    }, undefined as string | undefined);
}

function compareSemver(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}
