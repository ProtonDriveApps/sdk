/**
 * Use only what is exported here. This is the public supported API of the SDK.
 */

import { makeNodeUid } from './internal/uids';

export * from './interface';
export * from './cache';
export * from './errors';
export { OpenPGPCrypto, OpenPGPCryptoWithCryptoProxy, OpenPGPCryptoProxy } from './crypto';
export { ProtonDriveClient } from './protonDriveClient';
export { VERSION } from './version';

/**
 * Provides the node UID for the given raw volume and node IDs.
 * 
 * This is required only for the internal implementation to provide
 * backward compatibility with the old Drive web setup.
 * 
 * If you are having share ID, use `ProtonDriveClient::getNodeUid` instead.
 * 
 * @deprecated This method is not part of the public API.
 * @param volumeId - Volume of the node.
 * @param nodeId - Node/link ID (not UID).
 * @returns The node UID.
 */
export function generateNodeUid(volumeId: string, nodeId: string) {
    return makeNodeUid(volumeId, nodeId);
}
