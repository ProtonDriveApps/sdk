/*
 * The search engine is Rust, compiled to wasm. This makes sure the JS bindings
 * client/js imports (src/search/vendor, not committed) exist and are up to date:
 *
 *  - bindings newer than the Rust sources: nothing to do.
 *  - otherwise, with `boltffi` installed: rebuild them. boltffi.toml points the
 *    output at src/search/vendor, so boltffi's tsc resolves @boltffi/runtime and
 *    @types/node from client/js/node_modules.
 *  - otherwise, if bindings are there (e.g. a downloaded search-rs-pack-wasm
 *    artifact): use them as is.
 *
 * Without bindings the SDK still typechecks (against src/search/vendorFallback.d.ts)
 * and builds; search just won't work.
 *
 * Pass --force to rebuild regardless, and --optional to warn instead of fail
 * when bindings can't be produced (used by build). The boltffi/wasm-pack toolchain is
 * described in incubating/search/proton-drive-sdk-search/README.md.
 */
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '../../../../incubating/search');
const crateDir = path.join(workspaceDir, 'proton-drive-sdk-search');
const vendorDir = path.resolve(__dirname, '../../src/search/vendor');
const runtimeDir = path.resolve(__dirname, '../../node_modules/@boltffi/runtime');

// Only the variant used by the browser worker and the Bun in-process path;
// boltffi generates a few other entry points nothing here consumes.
const BINDING_FILES = [
    'proton_drive_sdk_search.js',
    'proton_drive_sdk_search.d.ts',
    'proton_drive_sdk_search_bg.wasm',
    'proton_drive_sdk_search_imports.js',
    'proton_drive_sdk_search_imports.d.ts',
];

// Everything that can change the generated bindings.
const SOURCES = [
    path.join(workspaceDir, 'Cargo.toml'),
    path.join(workspaceDir, 'Cargo.lock'),
    path.join(crateDir, 'Cargo.toml'),
    path.join(crateDir, 'boltffi.toml'),
    path.join(crateDir, 'src'),
];

const log = (message) => console.log(`[search-bindings] ${message}`);

/** Latest mtime of a file, or of any file under a directory. */
function newestMtime(target) {
    if (!existsSync(target)) {
        return 0;
    }
    const stat = statSync(target);
    if (!stat.isDirectory()) {
        return stat.mtimeMs;
    }
    // nosemgrep: path-join-resolve-traversal -- entries come from readdirSync of the hardcoded SOURCES, not user input.
    return Math.max(0, ...readdirSync(target).map((entry) => newestMtime(path.join(target, entry))));
}

/** Oldest mtime across `files` in `dir`, or 0 if any is missing. */
function oldestMtime(dir, files) {
    // nosemgrep: path-join-resolve-traversal -- files are the hardcoded BINDING_FILES, not user input.
    const paths = files.map((file) => path.join(dir, file));
    return paths.every((file) => existsSync(file)) ? Math.min(...paths.map((file) => statSync(file).mtimeMs)) : 0;
}

/** Version of the installed `boltffi` CLI, or undefined if it isn't installed. */
function boltffiCliVersion() {
    try {
        const output = execFileSync('boltffi', ['--version'], { encoding: 'utf8' });
        return output.trim().split(/\s+/).pop();
    } catch {
        return undefined;
    }
}

/** Version of the `boltffi` crate locked in Cargo.lock; the CLI must match it. */
function boltffiCrateVersion() {
    const lock = readFileSync(path.join(workspaceDir, 'Cargo.lock'), 'utf8');
    return lock.match(/name = "boltffi"\nversion = "([^"]+)"/)?.[1];
}

const force = process.argv.includes('--force');
const optional = process.argv.includes('--optional');
const sourcesMtime = Math.max(...SOURCES.map(newestMtime));

if (!force && oldestMtime(vendorDir, BINDING_FILES) > sourcesMtime) {
    log('Bindings are up to date.');
    process.exit(0);
}

const cliVersion = existsSync(crateDir) ? boltffiCliVersion() : undefined;

if (cliVersion) {
    const crateVersion = boltffiCrateVersion();
    if (cliVersion !== crateVersion) {
        log(`boltffi CLI is ${cliVersion} but the crate is ${crateVersion}; run \`cargo install boltffi_cli@${crateVersion}\`.`);
        process.exit(1);
    }
    if (!existsSync(runtimeDir)) {
        log('@boltffi/runtime is not installed; run `bun install` first.');
        process.exit(1);
    }
    log(`Building bindings with boltffi ${cliVersion}...`);
    execFileSync('boltffi', ['pack', '-v', 'wasm', '--deny-skipped'], { cwd: crateDir, stdio: 'inherit' });
    log(`Built bindings into ${path.relative(process.cwd(), vendorDir)}.`);
} else if (oldestMtime(vendorDir, BINDING_FILES)) {
    log(`boltffi not found; using the bindings already in ${path.relative(process.cwd(), vendorDir)}.`);
} else if (optional) {
    // e.g. the public mirror, which has no Rust crate: the SDK builds against
    // vendorFallback.d.ts, search just won't work at runtime.
    log('WARNING: no boltffi or prebuilt bindings; building without search.');
} else {
    log('boltffi not found and no prebuilt bindings; see incubating/search/proton-drive-sdk-search/README.md.');
    process.exit(1);
}
