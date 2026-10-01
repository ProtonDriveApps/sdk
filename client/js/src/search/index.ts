// Makes consumers compiling these sources (the CLIs) pick up the fallback types without their own include.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./vendorFallback.d.ts" />

export { createSearchDriveSdkClient, type NodeSource } from './driveSdkClient';
export { createEngine } from './engine';
export { createMemoryStorage } from './memoryStorage';
export type { ProtonDriveSearchClient, SearchServiceProvider } from './types';
export { createUnconnectedHttpClient } from './unconnectedHttpClient';
export { type DriveSearchEngine, default as initSearchWasm } from './vendor/proton_drive_sdk_search.js';
