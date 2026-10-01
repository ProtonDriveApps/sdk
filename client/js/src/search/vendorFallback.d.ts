/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fallback types for the generated search bindings in `vendor/`.
 *
 * The bindings (`proton_drive_sdk_search.{js,d.ts,_bg.wasm}`) are generated from
 * the Rust crate in `incubating/search` and are not committed. They can be
 * missing, e.g. in the public mirror (`incubating/search` isn't in
 * `.publishinclude`) or on a machine without the Rust/boltffi toolchain.
 *
 * Without bindings, the SDK still typechecks, lints, tests and builds:
 *  - `npm run build` runs `search-bindings --optional`, which warns and
 *    continues, and `copy-search-vendor-to-dist` skips the missing `vendor/`.
 *  - `tsc` uses the `any`-based types below instead of the real ones.
 * The result is an SDK without working search: `experimental.initSearch()`
 * fails at runtime when the worker can't load the missing bindings.
 *
 * TypeScript only uses this when `vendor/proton_drive_sdk_search.d.ts` is
 * missing, so it never hides errors where the bindings exist: CI jobs that
 * have them (client-js lint/check-types, internal CLI build, js-publish) and
 * the published npm package are checked against the real engine API.
 */
declare module '*/vendor/proton_drive_sdk_search.js' {
    export default function init(module?: unknown): Promise<unknown>;
    export const DriveSearchEngine: any;
    export type DriveSearchEngine = any;
    // Callback interfaces implemented on the JS side; any-typed parameters so
    // implementations still typecheck under noImplicitAny.
    export type DriveSdkClient = Record<string, (...args: any[]) => any>;
    export type Storage = Record<string, (...args: any[]) => any>;
    export type HttpClient = Record<string, (...args: any[]) => any>;
    export type Node = any;
    export type NodeUid = any;
}
