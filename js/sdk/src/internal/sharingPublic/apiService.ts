import { DriveAPIService, drivePaths, nodeTypeNumberToNodeType } from '../apiService';
import { Logger, MemberRole } from '../../interface';
import { makeNodeUid } from '../uids';
import { EncryptedNode } from '../nodes/interface';
import { EncryptedShareCrypto } from './interface';

type GetTokenInfoResponse = drivePaths['/drive/urls/{token}']['get']['responses']['200']['content']['application/json'];

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
}

function tokenToEncryptedNode(logger: Logger, token: GetTokenInfoResponse['Token']): EncryptedNode {
    const baseNodeMetadata = {
        // Internal metadata
        encryptedName: token.Name,

        // Basic node metadata
        uid: makeNodeUid(token.VolumeID, token.LinkID),
        parentUid: undefined,
        type: nodeTypeNumberToNodeType(logger, token.LinkType),
        creationTime: new Date(), // TODO

        isShared: false,
        isSharedPublicly: false,
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
