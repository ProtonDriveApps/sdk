import { DriveAPIService, drivePaths } from '../../apiService';
import { PublicLinkInfo, PublicLinkSrpAuth } from './interface';

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
    constructor(private apiService: DriveAPIService) {
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
        serverProof: string;
        sessionUid: string;
        sessionAccessToken?: string;
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
            serverProof: response.ServerProof,
            sessionUid: response.UID,
            sessionAccessToken: response.AccessToken,
        };
    }
}
