import { c } from 'ttag';

import { PrivateKey } from "../../crypto";
import { ValidationError } from "../../errors";
import { NodeEntity, NodeType } from "../../interface";
import { DownloadAPIService } from "./apiService";
import { DownloadCryptoService } from "./cryptoService";

export class FileDownloader {
    constructor(
        private apiService: DownloadAPIService,
        private cryptoService: DownloadCryptoService,
        private nodeKey: PrivateKey,
        private node: NodeEntity,
        private signal?: AbortSignal,
    ) {
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.nodeKey = nodeKey;
        this.node = node;
        this.signal = signal;
    }

    getClaimedSizeInBytes(): number | undefined {
        if (this.node.activeRevision?.ok) {
            return this.node.activeRevision.value.claimedSize;
        }
    }

    writeToStream(stream: WritableStream, onProgress: (writtenBytes: number) => void): DownloadController {
        const controller = new DownloadController();
        void this.downloadToStream(controller, stream, onProgress);
        return controller;
    }

    unsafeWriteToStream(stream: WritableStream, onProgress: (writtenBytes: number) => void): DownloadController {
        const controller = new DownloadController();
        void this.downloadToStream(controller, stream, onProgress);
        return controller;
    }

    private async downloadToStream(controller: DownloadController, stream: WritableStream, onProgress: (writtenBytes: number) => void): Promise<void> {
        if (this.node.type === NodeType.Folder) {
            throw new ValidationError(c("Error").t`Cannot download a folder`);
        }
        if (!this.node.activeRevision?.ok || !this.node.activeRevision.value) {
            throw new ValidationError(c("Error").t`File has no active revision`);
        }

        // TODO
        const nodeRevisionsUid = this.node.activeRevision.value.uid;
        const writer = stream.getWriter();
        for await (const block of this.apiService.iterateRevisionBlocks(nodeRevisionsUid, this.signal)) {
            await writer.write(block.bareUrl);
            onProgress(block.bareUrl.length);
        }
    }
}

class DownloadController {
    async pause(): Promise<void> {
    }

    async resume(): Promise<void> {
    }

    async completion(): Promise<void> {
    }
}
