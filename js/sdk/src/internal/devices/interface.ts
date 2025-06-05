import { PrivateKey } from "../../crypto";
import { DeviceType, MissingNode } from "../../interface";
import { DecryptedNode } from "../nodes";

export type DeviceMetadata = {
    uid: string,
    type: DeviceType
    rootFolderUid: string,
    creationTime: Date,
    lastSyncTime?: Date;
    hasDeprecatedName: boolean;
}

export interface SharesService {
    getMyFilesIDs(): Promise<{ volumeId: string }>;
    getMyFilesShareMemberEmailKey(): Promise<{ addressId: string, email: string, addressKey: PrivateKey, addressKeyId: string }>,
}

export interface NodesService {
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode | MissingNode>;
}

export interface NodesManagementService {
    renameNode(nodeUid: string, newName: string, options: {
        allowRenameRootNode: boolean,
    }): Promise<DecryptedNode>;
}
