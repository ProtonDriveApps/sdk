/*
 * The vendored wasm bindings aren't TypeScript, so the SWC step skips
 * them — they have to be copied into dist/ by hand instead. A build without
 * search (no generated bindings, e.g. the public mirror) has nothing to copy.
 */
import { cpSync, copyFileSync, existsSync } from 'fs';

if (existsSync('src/search/vendor')) {
    cpSync('src/search/vendor', 'dist/search/vendor', { recursive: true });
}
