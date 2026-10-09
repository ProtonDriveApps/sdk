import initSearchWasm, {
    DriveExtractEngine,
    type DriveSdkClient,
    DriveSearchEngine,
    type HttpClient,
    type Storage,
} from '../vendor/proton_drive_sdk_search.js';

/** The search wasm in any form the bindings accept: a fetch `Response`, its bytes, or a compiled module. */
export type SearchWasmSource = Parameters<typeof initSearchWasm>[0];

const CLIENT_UID = 'proton-drive-sdk-search';

/**
 * Loads the wasm once, on first use, for both engines built from it: a
 * runtime that never searches never loads the wasm.
 */
export class SearchWasmLoader {
    private wasmPromise?: Promise<unknown>;

    constructor(private loadWasm: () => Promise<SearchWasmSource>) {
        this.loadWasm = loadWasm;
    }

    init(): Promise<unknown> {
        this.wasmPromise ??= this.loadWasm().then(initSearchWasm);
        return this.wasmPromise;
    }
}

/**
 * Builds the drive search engine on first use, then hands out the same one.
 *
 * The drive search engine wraps every index (each split into shards, each
 * shard a search library engine) along with storage and the Drive API.
 *
 * `storage` and `http` are supplied by the caller so each runtime can pick its
 * own backend. `http` reaches the Drive API with paths relative to its base URL.
 */
export class DriveSearchEngineLoader {
    private driveSearchEnginePromise?: Promise<DriveSearchEngine>;

    constructor(
        private wasm: SearchWasmLoader,
        private storage: Storage,
        private http: HttpClient,
    ) {
        this.wasm = wasm;
        this.storage = storage;
        this.http = http;
    }

    getDriveSearchEngine(): Promise<DriveSearchEngine> {
        this.driveSearchEnginePromise ??= this.loadDriveSearchEngine();
        return this.driveSearchEnginePromise;
    }

    private async loadDriveSearchEngine(): Promise<DriveSearchEngine> {
        await this.wasm.init();
        const driveSearchEngine = DriveSearchEngine.new(
            this.storage,
            this.http,
            generateCsprngSeed(),
            unixClock(),
            CLIENT_UID,
        );
        if (!driveSearchEngine) {
            throw new Error('Failed to construct DriveSearchEngine');
        }
        await driveSearchEngine.init();
        return driveSearchEngine;
    }
}

/**
 * Builds the drive extract engine on first use, then hands out the same one.
 *
 * The drive extract engine takes nodes the extraction queue hands out,
 * resolves them through `sdk`, runs the extractors and uploads the extracts
 * through `http`.
 */
export class DriveExtractEngineLoader {
    private driveExtractEnginePromise?: Promise<DriveExtractEngine>;

    constructor(
        private wasm: SearchWasmLoader,
        private sdk: DriveSdkClient,
        private http: HttpClient,
    ) {
        this.wasm = wasm;
        this.sdk = sdk;
        this.http = http;
    }

    getDriveExtractEngine(): Promise<DriveExtractEngine> {
        this.driveExtractEnginePromise ??= this.loadDriveExtractEngine();
        return this.driveExtractEnginePromise;
    }

    private async loadDriveExtractEngine(): Promise<DriveExtractEngine> {
        await this.wasm.init();
        const driveExtractEngine = DriveExtractEngine.new(this.sdk, this.http, unixClock(), CLIENT_UID);
        if (!driveExtractEngine) {
            throw new Error('Failed to construct DriveExtractEngine');
        }
        return driveExtractEngine;
    }
}

/** wasm has no clock of its own; the drive engines read seconds since the Unix epoch. */
function unixClock() {
    return { now: () => BigInt(Math.floor(Date.now() / 1000)) };
}

/* The client needs to provide a random generator for the drive search engine. */
function generateCsprngSeed(): bigint {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return new DataView(bytes.buffer).getBigUint64(0);
}
