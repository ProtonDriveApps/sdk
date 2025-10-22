import { Logger } from '../../../interface';
import { DriveAPIService, drivePaths, permissionsToMemberRole } from '../../apiService';
import { makeNodeUid } from '../../uids';
import { PublicLinkInfo, PublicLinkSrpAuth, PublicLinkSession, EncryptedShareCrypto } from './interface';

type GetPublicLinkInfoResponse =
    drivePaths['/drive/urls/{token}/info']['get']['responses']['200']['content']['application/json'];

type PostPublicLinkAuthRequest = Extract<
    drivePaths['/drive/urls/{token}/auth']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostPublicLinkAuthResponse =
    drivePaths['/drive/urls/{token}/auth']['post']['responses']['200']['content']['application/json'];

/**
 * Provides API communication for managing public link session (not data).
 *
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class SharingPublicSessionAPIService {
    constructor(
        private logger: Logger,
        private apiService: DriveAPIService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
    }

    /**
     * Start a SRP handshake for public link session.
     */
    async initPublicLinkSession(token: string): Promise<PublicLinkInfo> {
        const response = await this.apiService.get<GetPublicLinkInfoResponse>(`drive/urls/${token}/info`);
        return {
            srp: {
                version: response.Version,
                modulus: response.Modulus,
                serverEphemeral: response.ServerEphemeral,
                salt: response.UrlPasswordSalt,
                srpSession: response.SRPSession,
            },
            isCustomPasswordProtected: (response.Flags & 1) === 1,
            isLegacy: response.Flags === 0 || response.Flags === 1,
            vendorType: response.VendorType,
            directAccess: response.DirectAccess
                ? {
                      nodeUid: makeNodeUid(response.DirectAccess.VolumeID, response.DirectAccess.LinkID),
                      directRole: permissionsToMemberRole(this.logger, response.DirectAccess.DirectPermissions),
                      publicRole: permissionsToMemberRole(this.logger, response.DirectAccess.PublicPermissions),
                  }
                : undefined,
        };
    }

    /**
     * Authenticate a public link session.
     *
     * It returns the server proof that must be validated, and the session uid
     * with an optional access token. The access token is only returned if
     * the session is newly created.
     */
    async authPublicLinkSession(
        token: string,
        srp: PublicLinkSrpAuth,
    ): Promise<{
        session: PublicLinkSession;
        encryptedShare: EncryptedShareCrypto;
        rootUid: string;
    }> {
        const response = await this.apiService.post<PostPublicLinkAuthRequest, PostPublicLinkAuthResponse>(
            `drive/urls/${token}/auth`,
            {
                ClientProof: srp.clientProof,
                ClientEphemeral: srp.clientEphemeral,
                SRPSession: srp.srpSession,
            },
        );

        return {
            session: {
                serverProof: response.ServerProof,
                sessionUid: response.UID,
                sessionAccessToken: response.AccessToken,
            },
            encryptedShare: {
                base64UrlPasswordSalt: response.Share.SharePasswordSalt,
                armoredKey: response.Share.ShareKey,
                armoredPassphrase: response.Share.SharePassphrase,
                publicRole: permissionsToMemberRole(this.logger, response.Share.PublicPermissions),
            },
            rootUid: makeNodeUid(response.Share.VolumeID, response.Share.LinkID),
        };
    }
}
