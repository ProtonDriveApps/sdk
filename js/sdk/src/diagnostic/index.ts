import { MemoryCache, NullCache } from '../cache';
import { ProtonDriveClientContructorParameters } from '../interface';
import { ProtonDriveClient } from '../protonDriveClient';
import { DiagnosticHTTPClient } from './httpClient';
import { Diagnostic } from './interface';
import { SDKDiagnostic } from './sdkDiagnostic';
import { FullSDKDiagnostic } from './sdkDiagnosticFull';
import { DiagnosticTelemetry } from './telemetry';

export type { Diagnostic, DiagnosticResult } from './interface';

/**
 * Initializes the diagnostic tool. It creates the instance of
 * ProtonDriveClient with the special probes to observe the logs,
 * metrics and HTTP calls; and enforced null/empty cache to always
 * start from scratch.
 */
export function initDiagnostic(
    options: Omit<ProtonDriveClientContructorParameters, 'entitiesCache' | 'cryptoCache' | 'telemetry'>,
): Diagnostic {
    const httpClient = new DiagnosticHTTPClient(options.httpClient);
    const telemetry = new DiagnosticTelemetry();

    const protonDriveClient = new ProtonDriveClient({
        ...options,
        httpClient,
        // Ensure we always start with a clean state.
        // Do not use memory cache as diagnostic should visit each node
        // only once and we don't want to grow memory usage.
        entitiesCache: new NullCache(),
        // However, we need to use memory cache for crypto cache to avoid
        // re-fetching the same key for all the children.
        cryptoCache: new MemoryCache(),
        // Special telemetry that observes the logs and metrics.
        telemetry,
    });

    const diagnostic = new SDKDiagnostic(protonDriveClient);
    return new FullSDKDiagnostic(diagnostic, telemetry, httpClient);
}
