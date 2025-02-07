export * from './interface/index.js';
export * from './cache/index.js';
export { OpenPGPCryptoWithCryptoProxy, OpenPGPCrypto } from './crypto/index.js';
export { ProtonDriveClient } from './protonDriveClient.js';
export { ProtonDrivePhotosClient } from './protonDrivePhotosClient.js';
export { ProtonDrivePublicClient } from './protonDrivePublicClient.js';

import { CACHE_TAG_KEYS as NODES_CACHE_TAG_KEYS } from './internal/nodes';

// TODO: Better would be if SDK could call it on the cache itself
export const CACHE_TAG_KEYS = Object.values(NODES_CACHE_TAG_KEYS);
