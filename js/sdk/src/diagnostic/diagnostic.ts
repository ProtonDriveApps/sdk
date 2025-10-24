import { MaybeNode } from '../interface';
import { ProtonDriveClient } from '../protonDriveClient';
import { DiagnosticHTTPClient } from './httpClient';
import { DiagnosticOptions, DiagnosticProgressCallback, DiagnosticResult } from './interface';
import { SDKDiagnostic } from './sdkDiagnostic';
import { DiagnosticTelemetry } from './telemetry';
import { zipGenerators } from './zipGenerators';

/**
 * Diagnostic tool that produces full diagnostic, including logs and metrics
 * by reading the events from the telemetry and HTTP client.
 */
export class Diagnostic {
    constructor(
        private telemetry: DiagnosticTelemetry,
        private httpClient: DiagnosticHTTPClient,
        private protonDriveClient: ProtonDriveClient,
    ) {
        this.telemetry = telemetry;
        this.httpClient = httpClient;
        this.protonDriveClient = protonDriveClient;
    }

    async *verifyMyFiles(
        options?: DiagnosticOptions,
        onProgress?: DiagnosticProgressCallback,
    ): AsyncGenerator<DiagnosticResult> {
        const diagnostic = new SDKDiagnostic(this.protonDriveClient, options, onProgress);
        yield* this.yieldEvents(diagnostic.verifyMyFiles(options?.expectedStructure));
    }

    async *verifyNodeTree(
        node: MaybeNode,
        options?: DiagnosticOptions,
        onProgress?: DiagnosticProgressCallback,
    ): AsyncGenerator<DiagnosticResult> {
        const diagnostic = new SDKDiagnostic(this.protonDriveClient, options, onProgress);
        yield* this.yieldEvents(diagnostic.verifyNodeTree(node, options?.expectedStructure));
    }

    private async *yieldEvents(generator: AsyncGenerator<DiagnosticResult>): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(generator, this.internalGenerator(), { stopOnFirstDone: true });
    }

    private async *internalGenerator(): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(this.telemetry.iterateEvents(), this.httpClient.iterateEvents());
    }
}
