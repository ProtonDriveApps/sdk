/*
 * The search engine is Rust, compiled to wasm. This makes sure the JS bindings
 * client/js imports (src/search/vendor, not committed) exist and are up to date:
 *
 *  - vendored files newer than the Rust sources: nothing to do.
 *  - otherwise, with `boltffi` installed: rebuild the crate, then vendor it.
 *  - otherwise, with an already-built package (e.g. a downloaded
 *    search-rs-pack-wasm artifact): vendor it as is.
 *
 * Without bindings the SDK still typechecks (against src/search/vendorFallback.d.ts)
 * and builds; search just won't work.
 *
 * Pass --force to rebuild regardless, and --optional to warn instead of fail
 * when bindings can't be produced (used by build). The boltffi/wasm-pack toolchain is
 * described in incubating/search/proton-drive-sdk-search/README.md.
 */
import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '../../../../incubating/search');
const crateDir = path.join(workspaceDir, 'proton-drive-sdk-search');
const generatedDir = path.join(workspaceDir, 'bindings/typescript/pkg');
const vendorDir = path.resolve(__dirname, '../../src/search/vendor');

// Only the variant used by the browser worker and the Bun in-process path;
// boltffi generates a few other entry points nothing here consumes.
const FILES_TO_VENDOR = [
    'proton_drive_sdk_search.js',
    'proton_drive_sdk_search.d.ts',
    'proton_drive_sdk_search_bg.wasm',
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
    // nosemgrep: path-join-resolve-traversal -- files are the hardcoded FILES_TO_VENDOR, not user input.
    const paths = files.map((file) => path.join(dir, file));
    return paths.every((file) => existsSync(file)) ? Math.min(...paths.map((file) => statSync(file).mtimeMs)) : 0;
}

function hasBoltffi() {
    try {
        execFileSync('boltffi', ['--version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

const force = process.argv.includes('--force');
const optional = process.argv.includes('--optional');
const sourcesMtime = Math.max(...SOURCES.map(newestMtime));

if (!force && oldestMtime(vendorDir, FILES_TO_VENDOR) > sourcesMtime) {
    log('Bindings are up to date.');
    process.exit(0);
}

if (existsSync(crateDir) && hasBoltffi()) {
    log('Building bindings with boltffi...');
    execFileSync('boltffi', ['pack', '-v', 'wasm', '--deny-skipped'], { cwd: crateDir, stdio: 'inherit' });
} else if (oldestMtime(generatedDir, FILES_TO_VENDOR)) {
    log(`boltffi not found; vendoring the prebuilt package from ${path.relative(process.cwd(), generatedDir)}.`);
} else if (optional) {
    // e.g. the public mirror, which has no Rust crate: the SDK builds against
    // vendorFallback.d.ts, search just won't work at runtime.
    log('WARNING: no boltffi or prebuilt package; building without search.');
    process.exit(0);
} else {
    log('boltffi not found and no prebuilt package; see incubating/search/proton-drive-sdk-search/README.md.');
    process.exit(1);
}

mkdirSync(vendorDir, { recursive: true });
for (const file of FILES_TO_VENDOR) {
    copyFileSync(path.join(generatedDir, file), path.join(vendorDir, file));
}
log(`Vendored ${FILES_TO_VENDOR.length} file(s) into ${path.relative(process.cwd(), vendorDir)}.`);
