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
 * the published npm package are checked against the real bindings API.
 */
declare module '*/vendor/proton_drive_sdk_search.js' {
    export default function init(module?: unknown): Promise<unknown>;
    export const DriveSearchEngine: any;
    export type DriveSearchEngine = any;
    export const DriveExtractEngine: any;
    export type DriveExtractEngine = any;
    // Callback interfaces implemented on the JS side by classes, which
    // annotate their parameters with the types below.
    export interface DriveSdkClient {
        closeNodeStream(...args: any[]): any;
        openNodeStream(...args: any[]): any;
        nextNode(...args: any[]): any;
        nextNodeBatch(...args: any[]): any;
    }
    export interface Storage {
        store(...args: any[]): any;
        load(...args: any[]): any;
        remove(...args: any[]): any;
        removeAll(...args: any[]): any;
    }
    export interface HttpClient {
        get(...args: any[]): any;
        put(...args: any[]): any;
        post(...args: any[]): any;
    }
    export type StorageKey = any;
    export type StreamToken = any;
    export type Node = any;
    export type NodeKind = any;
    export type Revision = any;
    export type Author = any;
    export type FfiNode = any;
    export type FfiNodeKind = any;
    export type FfiRevision = any;
    export type FfiAuthor = any;
    export type MemberRole = any;
    export type RevisionState = any;
    export type NodeUid = any;
    export type FoundItem = any;
    export const SearchIndex: any;
    // A class, not `any`: `instanceof` must still narrow an `unknown` error.
    export class SearchEngineErrorException extends Error {
        readonly value: any;
        constructor(value: any);
    }
    export type SearchQuery = any;
    export type DateRange = any;
    export type SearchIndex = any;
}
