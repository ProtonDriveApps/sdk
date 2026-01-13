import { MaybeNode } from '../interface';
import { ProtonDriveClient } from '../protonDriveClient';
import { ProtonDrivePhotosClient } from '../protonDrivePhotosClient';
import { DiagnosticHTTPClient } from './httpClient';
import { DiagnosticOptions, DiagnosticProgressCallback, DiagnosticResult, TreeNode } from './interface';
import { SDKDiagnosticMain } from './sdkDiagnosticMain';
import { SDKDiagnosticPhotos } from './sdkDiagnosticPhotos';
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
        private protonDrivePhotosClient: ProtonDrivePhotosClient,
    ) {
        this.telemetry = telemetry;
        this.httpClient = httpClient;
        this.protonDriveClient = protonDriveClient;
        this.protonDrivePhotosClient = protonDrivePhotosClient;
    }

    async *verifyMyFiles(
        options?: DiagnosticOptions,
        onProgress?: DiagnosticProgressCallback,
    ): AsyncGenerator<DiagnosticResult> {
        const diagnostic = new SDKDiagnosticMain(this.protonDriveClient, options, onProgress);
        yield* this.yieldEvents(diagnostic.verifyMyFiles(options?.expectedStructure));
    }

    async *verifyNodeTree(
        node: MaybeNode,
        options?: DiagnosticOptions,
        onProgress?: DiagnosticProgressCallback,
    ): AsyncGenerator<DiagnosticResult> {
        const diagnostic = new SDKDiagnosticMain(this.protonDriveClient, options, onProgress);
        yield* this.yieldEvents(diagnostic.verifyNodeTree(node, options?.expectedStructure));
    }

    async *verifyPhotosTimeline(
        options?: DiagnosticOptions,
        onProgress?: DiagnosticProgressCallback,
    ): AsyncGenerator<DiagnosticResult> {
        const diagnostic = new SDKDiagnosticPhotos(this.protonDrivePhotosClient, options, onProgress);
        yield* this.yieldEvents(diagnostic.verifyTimeline(options?.expectedStructure));
    }

    private async *yieldEvents(generator: AsyncGenerator<DiagnosticResult>): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(generator, this.internalGenerator(), { stopOnFirstDone: true });
    }

    private async *internalGenerator(): AsyncGenerator<DiagnosticResult> {
        yield* zipGenerators(this.telemetry.iterateEvents(), this.httpClient.iterateEvents());
    }

    async getNodeTreeStructure(node: MaybeNode): Promise<TreeNode> {
        const diagnostic = new SDKDiagnosticMain(this.protonDriveClient);
        return diagnostic.getStructure(node);
    }

    async getPhotosTimelineStructure(): Promise<TreeNode> {
        const diagnostic = new SDKDiagnosticPhotos(this.protonDrivePhotosClient);
        return diagnostic.getStructure();
    }
}
