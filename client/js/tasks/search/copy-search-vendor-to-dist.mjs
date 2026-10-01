/*
 * The vendored wasm bindings aren't TypeScript, so the SWC step skips
 * them — they have to be copied into dist/ by hand instead. A build without
 * search (no generated bindings, e.g. the public mirror) has nothing to copy.
 */
import { copyFileSync, existsSync, mkdirSync } from 'fs';

// boltffi generates more entry points into src/search/vendor; only ship the one
// the SDK imports (same list as BINDING_FILES in search-bindings.mjs).
const BINDING_FILES = [
    'proton_drive_sdk_search.js',
    'proton_drive_sdk_search.d.ts',
    'proton_drive_sdk_search_bg.wasm',
];

if (existsSync('src/search/vendor')) {
    mkdirSync('dist/search/vendor', { recursive: true });
    for (const file of BINDING_FILES) {
        copyFileSync(`src/search/vendor/${file}`, `dist/search/vendor/${file}`);
    }
}
