import { MaybeNode } from '../interface';
import { ProtonDriveClient } from '../protonDriveClient';
import { DiagnosticHTTPClient } from './httpClient';
import { DiagnosticOptions, DiagnosticResult } from './interface';
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

    async *verifyMyFiles(options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        const diagnostic = new SDKDiagnostic(this.protonDriveClient);
        yield* this.yieldEvents(diagnostic.verifyMyFiles(options));
    }

    async *verifyNodeTree(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        const diagnostic = new SDKDiagnostic(this.protonDriveClient);
        yield* this.yieldEvents(diagnostic.verifyNodeTree(node, options));
    }

    private async *yieldEvents(generator: AsyncGenerator<DiagnosticResult>): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(generator, this.internalGenerator(), { stopOnFirstDone: true });
    }

    private async *internalGenerator(): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(this.telemetry.iterateEvents(), this.httpClient.iterateEvents());
    }
}
