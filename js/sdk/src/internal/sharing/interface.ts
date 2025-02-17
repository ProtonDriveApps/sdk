import { NodeEntity, NodeType, MemberRole } from "../../interface";

export enum SharingType {
    SharedByMe = 'sharedByMe',
    sharedWithMe = 'sharedWithMe',
}

export interface EncryptedBookmark {
    tokenId: string;
    createdDate: Date;
    share: {
        armoredKey: string;
        armoredPassphrase: string;
    };
    url: {
        encryptedUrlPassword?: string;
        base64SharePasswordSalt: string;
    };
    node: {
        type: NodeType;
        mimeType?: string;
        encryptedName: string;
        armoredKey: string;
        armoredNodePassphrase: string;
        file: {
            base64ContentKeyPacket?: string;
        };
    };
}

/**
 * Interface describing the dependencies to the shares module.
 */
export interface SharesService {
    getMyFilesIDs(): Promise<{ volumeId: string }>,
}

/**
 * Interface describing the dependencies to the nodes module.
 */
export interface NodesService {
    getNode(nodeUid: string): Promise<NodeEntity>,
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeEntity>;
}
