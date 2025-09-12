import { DriveAPIService, drivePaths, nodeTypeNumberToNodeType } from '../apiService';
import { Logger, MemberRole } from '../../interface';
import { makeNodeUid, splitNodeUid } from '../uids';
import { EncryptedShareCrypto, EncryptedNode } from './interface';

const PAGE_SIZE = 50;

type GetTokenInfoResponse = drivePaths['/drive/urls/{token}']['get']['responses']['200']['content']['application/json'];

type GetTokenFolderChildrenResponse =
    drivePaths['/drive/urls/{token}/folders/{linkID}/children']['get']['responses']['200']['content']['application/json'];

/**
 * Provides API communication for accessing public link data.
 *
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class SharingPublicAPIService {
    constructor(
        private logger: Logger,
        private apiService: DriveAPIService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
    }

    async getPublicLinkRoot(token: string): Promise<{
        encryptedNode: EncryptedNode;
        encryptedShare: EncryptedShareCrypto;
    }> {
        const response = await this.apiService.get<GetTokenInfoResponse>(`drive/urls/${token}`);
        const encryptedNode = tokenToEncryptedNode(this.logger, response.Token);

        return {
            encryptedNode: encryptedNode,
            encryptedShare: {
                base64UrlPasswordSalt: response.Token.SharePasswordSalt,
                armoredKey: response.Token.ShareKey,
                armoredPassphrase: response.Token.SharePassphrase,
            },
        };
    }

    async *iterateFolderChildren(parentUid: string, signal?: AbortSignal): AsyncGenerator<EncryptedNode> {
        const { volumeId: token, nodeId } = splitNodeUid(parentUid);

        let page = 0;
        while (true) {
            const response = await this.apiService.get<GetTokenFolderChildrenResponse>(
                `drive/urls/${token}/folders/${nodeId}/children?Page=${page}&PageSize=${PAGE_SIZE}`,
                signal,
            );

            for (const link of response.Links) {
                yield linkToEncryptedNode(this.logger, token, link);
            }

            if (response.Links.length < PAGE_SIZE) {
                break;
            }
            page++;
        }
    }
}

function tokenToEncryptedNode(logger: Logger, token: GetTokenInfoResponse['Token']): EncryptedNode {
    const baseNodeMetadata = {
        // Internal metadata
        encryptedName: token.Name,

        // Basic node metadata
        uid: makeNodeUid(token.Token, token.LinkID),
        parentUid: undefined,
        type: nodeTypeNumberToNodeType(logger, token.LinkType),
        creationTime: new Date(), // TODO

        isShared: false,
        directRole: MemberRole.Viewer, // TODO
    };

    const baseCryptoNodeMetadata = {
        signatureEmail: token.SignatureEmail || undefined,
        armoredKey: token.NodeKey,
        armoredNodePassphrase: token.NodePassphrase,
        armoredNodePassphraseSignature: token.NodePassphraseSignature || undefined,
    };

    if (token.LinkType === 1 && token.NodeHashKey) {
        return {
            ...baseNodeMetadata,
            encryptedCrypto: {
                ...baseCryptoNodeMetadata,
                folder: {
                    armoredHashKey: token.NodeHashKey as string,
                },
            },
        };
    }

    if (token.LinkType === 2 && token.ContentKeyPacket) {
        return {
            ...baseNodeMetadata,
            totalStorageSize: token.Size || undefined,
            mediaType: token.MIMEType || undefined,
            encryptedCrypto: {
                ...baseCryptoNodeMetadata,
                file: {
                    base64ContentKeyPacket: token.ContentKeyPacket,
                },
            },
        };
    }

    throw new Error(`Unknown node type: ${token.LinkType}`);
}

function linkToEncryptedNode(
    logger: Logger,
    token: string,
    link: GetTokenFolderChildrenResponse['Links'][0],
): EncryptedNode {
    const baseNodeMetadata = {
        // Internal metadata
        hash: link.Hash || undefined,
        encryptedName: link.Name,

        // Basic node metadata
        uid: makeNodeUid(token, link.LinkID),
        parentUid: link.ParentLinkID ? makeNodeUid(token, link.ParentLinkID) : undefined,
        type: nodeTypeNumberToNodeType(logger, link.Type),
        creationTime: new Date(), // TODO
        totalStorageSize: link.TotalSize,

        isShared: false,
        directRole: MemberRole.Viewer, // TODO
    };

    const baseCryptoNodeMetadata = {
        signatureEmail: link.SignatureEmail || undefined,
        armoredKey: link.NodeKey,
        armoredNodePassphrase: link.NodePassphrase,
        armoredNodePassphraseSignature: link.NodePassphraseSignature || undefined,
    };

    if (link.Type === 1 && link.FolderProperties) {
        return {
            ...baseNodeMetadata,
            encryptedCrypto: {
                ...baseCryptoNodeMetadata,
                folder: {
                    armoredHashKey: link.FolderProperties.NodeHashKey as string,
                },
            },
        };
    }

    if (link.Type === 2 && link.FileProperties?.ContentKeyPacket) {
        return {
            ...baseNodeMetadata,
            totalStorageSize: link.FileProperties.ActiveRevision?.Size || undefined,
            mediaType: link.MIMEType || undefined,
            encryptedCrypto: {
                ...baseCryptoNodeMetadata,
                file: {
                    base64ContentKeyPacket: link.FileProperties.ContentKeyPacket,
                },
            },
        };
    }

    throw new Error(`Unknown node type: ${link.Type}`);
}
