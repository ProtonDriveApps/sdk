import { sha1 } from "@noble/hashes/legacy";
import { bytesToHex } from '@noble/hashes/utils';

/**
 * A WritableStream that computes SHA1 hash on the fly.
 * The computed SHA1 hash is available after the stream is closed.
 */
export class IntegrityVerificationStream extends WritableStream<Uint8Array> {
    private sha1Hash = sha1.create();
    private _computedSha1: string | undefined = undefined;
    private _computedSizeInBytes: number = 0;
    private _isClosed = false;

    constructor() {
        super({
            start: () => {},
            write: (chunk: Uint8Array) => {
                if (this._isClosed) {
                    throw new Error('Cannot write to a closed stream');
                }
                this.sha1Hash.update(chunk);
                this._computedSizeInBytes += chunk.length;
            },
            close: () => {
                if (!this._isClosed) {
                    this._computedSha1 = bytesToHex(this.sha1Hash.digest());
                    this._isClosed = true;
                }
            },
            abort: () => {
                this._isClosed = true;
                this._computedSha1 = undefined;
            }
        });
    }

    /**
     * Get the computed SHA1 hash. Only available after the stream is closed.
     * @returns The SHA1 hash as a hex string, or null if not yet computed or stream was aborted
     */
    get computedSha1(): string | undefined {
        return this._computedSha1;
    }

    /**
     * Get the computed size in bytes. Only available after the stream is closed.
     * @returns The size in bytes, or 0 if not yet computed or stream was aborted
     */
    get computedSizeInBytes(): number | undefined {
        if (!this._isClosed) {
            return undefined;
        }
        return this._computedSizeInBytes;
    }

} 