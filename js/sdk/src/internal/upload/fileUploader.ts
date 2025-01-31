import { Thumbnail } from "../../interface/index.js";

export class Fileuploader {
    private controller: UploadController;

    constructor(queue: any, nodeKey: any, draft: any) {
        this.controller = new UploadController(draft.nodeUid);
    }

    writeStream(stream: ReadableStream, thumnbails: Thumbnail[], onProgress: (uploadedBytes: number) => void): UploadController {
        // TODO
        return this.controller;
    }
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
