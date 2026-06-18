/**
 * Parses and evaluates `x-pm-drive-requirements` and `x-pm-drive-platform-requirements`
 * response headers. Intended to run after each HTTP response.
 */

export enum RequirementScope {
    Drive = 'drive',
    Photos = 'photos',
    Docs = 'docs',
}

// For now only test feature is supported. In the future we will add more
// features as they are defined and implemented by the SDK.
enum KnownFeatures {
    TestFeature = 1 << 0,
}

export const SUPPORTED_REQUIREMENT_MASK_BY_SCOPE: Readonly<Record<RequirementScope, number>> = {
    [RequirementScope.Drive]: KnownFeatures.TestFeature,
    [RequirementScope.Photos]: KnownFeatures.TestFeature,
    [RequirementScope.Docs]: KnownFeatures.TestFeature,
};

export type ProcessDriveRequirementHeadersOptions = {
    clientSdkVersion: string;
    supportedRequirementMasksByScope: Readonly<Record<RequirementScope, number>>;
    onUnsupportedFeature: (scope: RequirementScope, requiredMask: number) => void;
    onRequiredUpdate: (requiredVersion: string) => void;
    onSuggestedUpdate: (suggestedVersion: string) => void;
};

export function processDriveRequirementHeaders(
    headers: Headers,
    options: ProcessDriveRequirementHeadersOptions,
): void {
    const requirements = headers.get('x-pm-drive-requirements');
    if (requirements) {
        processFeatureRequirements(options, requirements);
    }

    const platform = headers.get('x-pm-drive-platform-requirements');
    if (platform) {
        processPlatformRequirements(options, platform);
    }
}

function processFeatureRequirements(
    options: Pick<ProcessDriveRequirementHeadersOptions, 'supportedRequirementMasksByScope' | 'onUnsupportedFeature'>,
    raw: string,
): void {
    // Example of requirement header: "drive=1 photos=2"
    const fields = parseKeyValuePairs(raw);
    for (const [scopeStr, valueStr] of fields) {
        const scope = scopeStr as RequirementScope;
        const supported = options.supportedRequirementMasksByScope[scope];
        if (supported === undefined) {
            continue;
        }

        const requiredMask = Number.parseInt(valueStr, 10);
        if (isNaN(requiredMask) || requiredMask <= 0) {
            continue;
        }

        const missing = requiredMask & ~supported;
        if (missing !== 0) {
            options.onUnsupportedFeature(scope, requiredMask);
        }
    }
}

function processPlatformRequirements(
    options: Pick<ProcessDriveRequirementHeadersOptions, 'clientSdkVersion' | 'onRequiredUpdate' | 'onSuggestedUpdate'>,
    raw: string,
): void {
    // Example of platform requirement header: "required=2.0.0 suggested=9.9.9"
    const fields = parseKeyValuePairs(raw);
    const required = fields.get('required');
    const suggested = fields.get('suggested');

    if (required && isUpdateNeeded(options.clientSdkVersion, required)) {
        options.onRequiredUpdate(required);
        return;
    }
    if (suggested && isUpdateNeeded(options.clientSdkVersion, suggested)) {
        options.onSuggestedUpdate(suggested);
    }
}

function isUpdateNeeded(clientVersion: string, minVersion: string): boolean {
    if (!clientVersion || !minVersion) {
        return false;
    }

    const cmp = compareSemverLoose(clientVersion, minVersion);
    if (cmp === null) {
        return false;
    }
    return cmp < 0;
}

function parseKeyValuePairs(raw: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
        const split = token.split('=');
        if (split.length !== 2) {
            continue;
        }

        const key = split[0].trim().toLowerCase();
        if (!key) {
            continue;
        }

        const value = split[1].trim();
        if (!value) {
            continue;
        }

        out.set(key, value);
    }
    return out;
}

function compareSemverLoose(a: string, b: string): number | null {
    const pa = parseSemverParts(a);
    const pb = parseSemverParts(b);
    if (!pa || !pb) {
        return null;
    }
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) {
            return pa[i] < pb[i] ? -1 : 1;
        }
    }
    return 0;
}

function parseSemverParts(v: string): [number, number, number] | null {
    const trimmed = v.trim();
    const m = trimmed.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) {
        return null;
    }
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}
