import { PrivateKey } from "../../crypto";
import { Thumbnail } from "../../interface";

export class Fileuploader {
    private controller: UploadController;

    constructor(nodeKey: PrivateKey, draftNodeRevisionUid: string) {
        this.controller = new UploadController(draftNodeRevisionUid);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    writeStream(stream: ReadableStream, thumnbails: Thumbnail[], onProgress: (uploadedBytes: number) => void): UploadController {
        // TODO
        return this.controller;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    writeFile(fileObject: File, thumnbails: Thumbnail[], onProgress: (uploadedBytes: number) => void): UploadController {
        // TODO
        return this.controller;
    }
}

class UploadController {
    private draftNodeUid: string;

    constructor(draftNodeUid: string) {
        this.draftNodeUid = draftNodeUid;
    }

    pause(): void {}

    resume(): void {}

    async completion(): Promise<string> {
        // TODO: wait for upload to be finished
        // TODO: once completed, its not draft anymore
        return this.draftNodeUid;
    }
}
