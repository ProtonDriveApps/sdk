import { MaybeNode } from "../interface";
import { DiagnosticHTTPClient } from "./httpClient";
import { Diagnostic, DiagnosticOptions, DiagnosticResult } from "./interface";
import { DiagnosticTelemetry } from "./telemetry";
import { zipGenerators } from "./zipGenerators";

/**
 * Diagnostic tool that produces full diagnostic, including logs and metrics
 * by reading the events from the telemetry and HTTP client.
 */
export class FullSDKDiagnostic implements Diagnostic {
    constructor(private diagnostic: Diagnostic, private telemetry: DiagnosticTelemetry, private httpClient: DiagnosticHTTPClient) {
        this.diagnostic = diagnostic;
        this.telemetry = telemetry;
        this.httpClient = httpClient;
    }

    async* verifyMyFiles(options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        yield* this.yieldEvents(this.diagnostic.verifyMyFiles(options));
    }

    async* verifyNodeTree(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        yield* this.yieldEvents(this.diagnostic.verifyNodeTree(node, options));
    }

    private async* yieldEvents(generator: AsyncGenerator<DiagnosticResult>): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(
            generator,
            this.internalGenerator(),
            { stopOnFirstDone: true },
        );
    }

    private async* internalGenerator(): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(
            this.telemetry.iterateEvents(),
            this.httpClient.iterateEvents(),
        );
    }
}
