import { ProtonDriveHTTPClient } from '../../../interface';
import { SRPModule } from '../../../crypto';
import { DriveAPIService } from '../../apiService';
import { SharingPublicSessionAPIService } from './apiService';
import { SharingPublicSessionHttpClient } from './httpClient';
import { PublicLinkInfo } from './interface';
import { SharingPublicLinkSession } from './session';
import { getTokenAndPasswordFromUrl } from './url';

/**
 * Manages sessions for public links.
 *
 * It can be used to get access to multiple public links.
 */
export class SharingPublicSessionManager {
    private api: SharingPublicSessionAPIService;

    private infosPerToken: Map<string, PublicLinkInfo> = new Map();

    constructor(
        private httpClient: ProtonDriveHTTPClient,
        apiService: DriveAPIService,
        private srpModule: SRPModule,
    ) {
        this.httpClient = httpClient;
        this.srpModule = srpModule;

        this.api = new SharingPublicSessionAPIService(apiService);
    }

    /**
     * Get the info for a public link.
     *
     * It returns the info for the public link, including if it is custom
     * password protected, if it is legacy (not supported anymore), and
     * the vendor type (whether it is Proton Docs, for example, and should
     * be redirected to the public Docs app).
     *
     * @param url - The URL of the public link.
     */
    async getInfo(url: string): Promise<{
        isCustomPasswordProtected: boolean;
        isLegacy: boolean;
        vendorType: number;
    }> {
        const { token } = getTokenAndPasswordFromUrl(url);

        const info = await this.api.initPublicLinkSession(token);
        this.infosPerToken.set(token, info);

        return {
            isCustomPasswordProtected: info.isCustomPasswordProtected,
            isLegacy: info.isLegacy,
            vendorType: info.vendorType,
        };
    }

    /**
     * Authenticate a public link session.
     *
     * It returns HTTP client that must be used for the endpoints to access the
     * public link data.
     *
     * It returnes parsed token and full password (password from the URL +
     * custom password) that can be used for decrypting the share key.
     *
     * @param url - The URL of the public link.
     * @param customPassword - The custom password for the public link, if it is
     * custom password protected.
     */
    async auth(
        url: string,
        customPassword?: string,
    ): Promise<{
        token: string;
        password: string;
        httpClient: SharingPublicSessionHttpClient;
    }> {
        const { token, password: urlPassword } = getTokenAndPasswordFromUrl(url);

        let info = this.infosPerToken.get(token);
        if (!info) {
            info = await this.api.initPublicLinkSession(token);
        }

        const password = `${urlPassword}${customPassword || ''}`;

        const session = new SharingPublicLinkSession(this.api, this.srpModule, token, password);
        await session.auth(info.srp);

        return {
            token,
            password,
            httpClient: new SharingPublicSessionHttpClient(this.httpClient, session),
        };
    }
}
