import { sha1 } from "@noble/hashes/legacy";
import { bytesToHex } from '@noble/hashes/utils';

export class UploadDigests {
    constructor(private digestSha1 = sha1.create()) {
        this.digestSha1 = digestSha1;
    }

    update(data: Uint8Array): void {
        this.digestSha1.update(data);
    }

    digests(): { sha1: string } {
        return {
            sha1: bytesToHex(this.digestSha1.digest()),
        }
    }
}
